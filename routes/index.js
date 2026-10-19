var express = require("express");
var router = express.Router();
const passport = require("passport");
const localStrategy = require("passport-local");
const userModel = require("./users");
const postModel = require("./posts");
const storyModel = require("./story");
const commentModel = require("./comment");
const notificationModel = require("./notification");
const { notify, removeNotification } = require("../utils/notify");
passport.use(new localStrategy(userModel.authenticate()));
const upload = require("./multer");
const utils = require("../utils/utils");
const generateCaption = require("../config/germini");
const fs = require("fs");
const path = require("path");


router.get("/", function (req, res) {
  res.render("index", { footer: false });
});

router.get("/login", function (req, res) {
  res.render("login", { footer: false });
});

// Comment page
router.get("/comment/:id", isLoggedIn, async function (req, res) {
  try {
    const user = await userModel.findOne({ username: req.session.passport.user });
    const post = await postModel.findById(req.params.id).populate("user");
    if (!post || !post.user) return res.redirect("/feed");

    const docs = await commentModel
      .find({ post: post._id })
      .populate("user", "username picture")
      .sort({ createdAt: 1 });

    const me = user._id.toString();
    const postOwner = post.user._id.toString();

    const comments = docs
      .filter((c) => c.user)
      .map((c) => ({
        id: c._id.toString(),
        text: c.text,
        username: c.user.username,
        picture: c.user.picture,
        time: c.createdAt,
        parent: c.parent ? c.parent.toString() : null,
        likeCount: c.likes.length,
        liked: c.likes.some((id) => id.toString() === me),
        canDelete: c.user._id.toString() === me || postOwner === me,
      }));

    const commentData = JSON.stringify({
      postId: post._id.toString(),
      me: { username: user.username, picture: user.picture },
      comments,
    }).replace(/</g, "\\u003c");

    res.render("comment", { footer: false, post, user, commentData });
  } catch (err) {
    console.error("Comment page error:", err);
    res.status(500).send("Server Error");
  }
});

// Naya comment ya reply
router.post("/comment/:id", isLoggedIn, async function (req, res) {
  try {
    const text = (req.body.text || "").trim().slice(0, 500);
    if (!text) return res.status(400).json({ error: "Comment can't be empty." });

    const user = await userModel.findOne({ username: req.session.passport.user });
    const post = await postModel.findById(req.params.id);
    if (!post) return res.status(404).json({ error: "Post not found" });

    // Reply ho to hamesha main comment ke neeche (Instagram jaisa one-level)
    let parent = null;
    if (req.body.parent) {
      const p = await commentModel.findById(req.body.parent);
      if (p && p.post.toString() === post._id.toString()) {
        parent = p.parent || p._id;
      }
    }

    const c = await commentModel.create({
      text,
      user: user._id,
      post: post._id,
      parent,
    });

    let replyTarget = null;
if (parent) {
  const pc = await commentModel.findById(parent).select("user");
  if (pc) replyTarget = pc.user.toString();
}
if (replyTarget) {
  notify({ to: replyTarget, from: user._id, type: "reply", post: post._id, text });
}
if (post.user.toString() !== replyTarget) {
  notify({ to: post.user, from: user._id, type: "comment", post: post._id, text });
}

    res.json({
      comment: {
        id: c._id.toString(),
        text: c.text,
        username: user.username,
        picture: user.picture,
        time: c.createdAt,
        parent: parent ? parent.toString() : null,
        likeCount: 0,
        liked: false,
        canDelete: true,
      },
    });
  } catch (err) {
    console.error("Add comment error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// Comment like / unlike
router.post("/comment/like/:cid", isLoggedIn, async function (req, res) {
  try {
    const user = await userModel.findOne({ username: req.session.passport.user });
    const c = await commentModel.findById(req.params.cid);
    if (!c) return res.status(404).json({ error: "Comment not found" });

    const idx = c.likes.findIndex((id) => id.toString() === user._id.toString());
    if (idx === -1) c.likes.push(user._id);
    else c.likes.splice(idx, 1);
    await c.save();

    res.json({ liked: idx === -1, count: c.likes.length });
  } catch (err) {
    console.error("Comment like error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// Comment delete: comment ka owner ya post ka owner
router.delete("/comment/:cid", isLoggedIn, async function (req, res) {
  try {
    const user = await userModel.findOne({ username: req.session.passport.user });
    const c = await commentModel.findById(req.params.cid);
    if (!c) return res.status(404).json({ error: "Comment not found" });

    const post = await postModel.findById(c.post);
    const me = user._id.toString();
    const allowed =
      c.user.toString() === me || (post && post.user.toString() === me);
    if (!allowed) return res.status(403).json({ error: "Not allowed" });

    await commentModel.deleteMany({ $or: [{ _id: c._id }, { parent: c._id }] });
    res.json({ success: true });
  } catch (err) {
    console.error("Delete comment error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

router.delete("/post/:id", isLoggedIn, async function (req, res) {
  try {
    const user = await userModel.findOne({
      username: req.session.passport.user,
    });
    const post = await postModel.findById(req.params.id);

    if (!post) {
      return res.status(404).json({ error: "Post not found" });
    }

    
    if (post.user.toString() !== user._id.toString()) {
      return res.status(403).json({ error: "Not allowed" });
    }

    user.posts.pull(post._id);
    await user.save();

    await userModel.updateMany(
      { saved: post._id },
      { $pull: { saved: post._id } }
    );

  
    if (post.picture && !post.picture.startsWith("http")) {
      const filePath = path.join(
        __dirname,
        "../public/images/uploads",
        path.basename(post.picture)
      );
      fs.unlink(filePath, () => {});
    }

    await commentModel.deleteMany({ post: post._id });
    await notificationModel.deleteMany({ post: post._id });
        await post.deleteOne();


    res.json({ success: true });
  } catch (err) {
    console.error("Delete post error:", err);
    res.status(500).json({ error: "Server error" });
  }
});



router.delete("/story/:id", isLoggedIn, async function (req, res) {
  try {
    const user = await userModel.findOne({
      username: req.session.passport.user,
    });
    const story = await storyModel.findById(req.params.id);

    if (!story) return res.status(404).json({ error: "Story not found" });

    // Sirf owner delete kar sakta hai
    if (story.user.toString() !== user._id.toString()) {
      return res.status(403).json({ error: "Not allowed" });
    }

    user.stories.pull(story._id);
    await user.save();

    fs.unlink(
      path.join(__dirname, "../public/images/uploads", path.basename(story.story)),
      () => {}
    );
    await story.deleteOne();

    res.json({ success: true });
  } catch (err) {
    console.error("Delete story error:", err);
    res.status(500).json({ error: "Server error" });
  }
});


router.post("/story/:id/view", isLoggedIn, async function (req, res) {
  try {
    const user = await userModel.findOne({ username: req.session.passport.user });
    const story = await storyModel.findById(req.params.id);
    if (!story) return res.status(404).json({ error: "Story not found" });

    const me = user._id.toString();
    const already = story.viewers.some((v) => v.user.toString() === me);
    if (story.user.toString() !== me && !already) {
      story.viewers.push({ user: user._id });
      await story.save();
    }
    res.json({ success: true });
  } catch (err) {
    console.error("Story view error:", err);
    res.status(500).json({ error: "Server error" });
  }
});


router.post("/story/:id/like", isLoggedIn, async function (req, res) {
  try {
    const user = await userModel.findOne({ username: req.session.passport.user });
    const story = await storyModel.findById(req.params.id);
    if (!story) return res.status(404).json({ error: "Story not found" });

    const idx = story.likes.findIndex((id) => id.toString() === user._id.toString());
    if (idx === -1) story.likes.push(user._id);
    else story.likes.splice(idx, 1);
    await story.save();

    if (idx === -1) {
  notify({ to: story.user, from: user._id, type: "story_like" });
} else {
  removeNotification({ to: story.user, from: user._id, type: "story_like" });
}

    res.json({ liked: idx === -1, count: story.likes.length });
  } catch (err) {
    console.error("Story like error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

router.get("/story/:id/viewers", isLoggedIn, async function (req, res) {
  try {
    const user = await userModel.findOne({ username: req.session.passport.user });
    const story = await storyModel
      .findById(req.params.id)
      .populate("viewers.user", "username picture");
    if (!story) return res.status(404).json({ error: "Story not found" });
    if (story.user.toString() !== user._id.toString()) {
      return res.status(403).json({ error: "Not allowed" });
    }

    const likedSet = new Set(story.likes.map((id) => id.toString()));
    const viewers = story.viewers
      .filter((v) => v.user)
      .map((v) => ({
        username: v.user.username,
        picture: v.user.picture,
        liked: likedSet.has(v.user._id.toString()),
      }));

    res.json({ viewers, likeCount: story.likes.length });
  } catch (err) {
    console.error("Story viewers error:", err);
    res.status(500).json({ error: "Server error" });
  }
});


router.get("/notifications", isLoggedIn, async function (req, res) {
  try {
    const user = await userModel.findOne({ username: req.session.passport.user });

    const docs = await notificationModel
      .find({ to: user._id })
      .populate("from", "username picture")
      .populate("post", "picture")
      .sort({ createdAt: -1 })
      .limit(50);

    const items = docs
      .filter((n) => n.from)
      .map((n) => ({
        type: n.type,
        text: n.text,
        username: n.from.username,
        picture: n.from.picture,
        postPicture: n.post ? n.post.picture : null,
        link: n.post
          ? "/comment/" + n.post._id
          : n.type === "story_like"
          ? "/feed"
          : "/profile/" + n.from.username,
        time: n.createdAt,
        unread: !n.read,
      }));

    // Page khulte hi sab read mark ho jayengi (is baar highlight dikhega)
    await notificationModel.updateMany({ to: user._id, read: false }, { read: true });

    res.render("notifications", {
      footer: true,
      user,
      items,
      dater: utils.formatRelativeTime,
    });
  } catch (err) {
    console.error("Notifications page error:", err);
    res.status(500).send("Server Error");
  }
});

router.get("/notifications/count", isLoggedIn, async function (req, res) {
  try {
    const user = await userModel.findOne({ username: req.session.passport.user });
    const count = await notificationModel.countDocuments({ to: user._id, read: false });
    res.json({ count });
  } catch (err) {
    res.status(500).json({ count: 0 });
  }
});


router.get("/like/:postid", async function (req, res) {
  const post = await postModel.findOne({ _id: req.params.postid });
  const user = await userModel.findOne({ username: req.session.passport.user });
  if (post.like.indexOf(user._id) === -1) {
  post.like.push(user._id);
  notify({ to: post.user, from: user._id, type: "like", post: post._id });
} else {
  post.like.splice(post.like.indexOf(user._id), 1);
  removeNotification({ to: post.user, from: user._id, type: "like", post: post._id });
}
  await post.save();
  res.json(post);
});

router.get("/feed", isLoggedIn, async function (req, res) {
  let user = await userModel
    .findOne({ username: req.session.passport.user })
    .populate("posts");

  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const storyDocs = await storyModel
    .find({
      user: { $in: [user._id, ...user.following] },
      createdAt: { $gte: since },
    })
    .populate("user", "username picture")
    .sort({ createdAt: 1 });

  const me = user._id.toString();
  const groupsMap = {};
  storyDocs.forEach(function (s) {
    if (!s.user) return;
    const key = s.user._id.toString();
    if (!groupsMap[key]) {
      groupsMap[key] = {
        userId: key,
        username: s.user.username,
        picture: s.user.picture,
        own: key === me,
        items: [],
      };
    }
    groupsMap[key].items.push({
      id: s._id.toString(),
      src: "/images/uploads/" + s.story,
      time: s.createdAt,
      caption: s.caption || "",
      likeCount: s.likes.length,
      liked: s.likes.some((id) => id.toString() === me),
      viewCount: s.viewers.length,
    });
  });

  const storyGroups = Object.values(groupsMap).sort(
    (a, b) => (b.own ? 1 : 0) - (a.own ? 1 : 0)
  );
  const storyData = JSON.stringify(storyGroups).replace(/</g, "\\u003c");

  // Pehle posts, phir unke comment counts
  let posts = await postModel
    .find({ user: { $in: [user._id, ...user.following] } })
    .populate("user")
    .sort({ _id: -1 });
  posts = posts.filter((p) => p.user);

  const countRows = await commentModel.aggregate([
    { $match: { post: { $in: posts.map((p) => p._id) } } },
    { $group: { _id: "$post", n: { $sum: 1 } } },
  ]);
  const commentCounts = {};
  countRows.forEach((r) => (commentCounts[r._id.toString()] = r.n));

  const unreadCount = await notificationModel.countDocuments({ to: user._id, read: false });



  res.render("feed", {
    footer: true,
    user,
    posts,
    storyGroups,
    storyData,
    commentCounts,
    dater: utils.formatRelativeTime,
  });
});

router.get("/profile", isLoggedIn, async function (req, res) {
  let user = await userModel
    .findOne({ username: req.session.passport.user })
    .populate("posts")
    .populate("saved");
  console.log(user);

  res.render("profile", { footer: true, user });
});

router.get("/profile/:user", isLoggedIn, async function (req, res) {
  let user = await userModel.findOne({ username: req.session.passport.user });

  if (user.username === req.params.user) {
   return res.redirect("/profile");
  }

  let userprofile = await userModel
    .findOne({ username: req.params.user })
    .populate("posts");

  res.render("userprofile", { footer: true, userprofile, user });
});

router.get("/follow/:userid", isLoggedIn, async function (req, res) {
  try {
    let followKarneWaala = await userModel.findOne({
      username: req.session.passport.user,
    });

    let followHoneWaala = await userModel.findOne({ _id: req.params.userid });

    // User na mile ya khud ko follow karne ki koshish ho to wapas bhejo
    if (!followHoneWaala || followHoneWaala._id.equals(followKarneWaala._id)) {
      return res.redirect("back");
    }

    if (followKarneWaala.following.indexOf(followHoneWaala._id) !== -1) {
      // Unfollow
      let index = followKarneWaala.following.indexOf(followHoneWaala._id);
      followKarneWaala.following.splice(index, 1);

      let index2 = followHoneWaala.followers.indexOf(followKarneWaala._id);
      if (index2 !== -1) followHoneWaala.followers.splice(index2, 1);

      removeNotification({
        to: followHoneWaala._id,
        from: followKarneWaala._id,
        type: "follow",
      });
    } else {
      // Follow
      followHoneWaala.followers.push(followKarneWaala._id);
      followKarneWaala.following.push(followHoneWaala._id);

      notify({
        to: followHoneWaala._id,
        from: followKarneWaala._id,
        type: "follow",
      });
    }

    await followHoneWaala.save();
    await followKarneWaala.save();

    res.redirect("back");
  } catch (err) {
    console.error("Follow error:", err);
    res.status(500).send("Something went wrong");
  }
});

router.get("/search", isLoggedIn, async function (req, res) {
  let user = await userModel.findOne({ username: req.session.passport.user });
  res.render("search", { footer: true, user });
});

router.get('/save', isLoggedIn, async function(req, res) {
  try {
    // Find the user using their username stored in the session
    const user = await userModel.findOne({ username: req.session.passport.user }).populate("saved");
    // Render the 'save' template with the user data
    res.render('save', { user: user });
  } catch (error) {
    // Handle any errors
    console.error("Error:", error);
    res.status(500).send('Internal Server Error');
  }
});

router.get('/save/:id', isLoggedIn, async function(req, res) {
  try {
    const user = await userModel.findOne({ username: req.session.passport.user }).populate("saved");
    const postId = req.params.id;
    const savedPost = await postModel.findById(postId);
    if (!savedPost) {
      return res.status(404).json({ error: 'Post not found' });
    }
    const alreadySavedIndex = user.saved.findIndex(saved => saved._id.toString() === postId);

    if (alreadySavedIndex !== -1) {
      user.saved.splice(alreadySavedIndex, 1);
    } else {
      user.saved.push(savedPost);
    }

    await user.save();

    res.json({ success: true });
  } catch (error) {
    
    console.error("Error:", error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});


router.get("/search/:user", isLoggedIn, async function (req, res) {
  const searchTerm = `^${req.params.user}`;
  const regex = new RegExp(searchTerm);

  let users = await userModel.find({ username: { $regex: regex } });

  res.json(users);
});

router.get("/edit", isLoggedIn, async function (req, res) {
  const user = await userModel.findOne({ username: req.session.passport.user });
  res.render("edit", { footer: true, user });
});

router.get("/upload", isLoggedIn, async function (req, res) {
  let user = await userModel.findOne({ username: req.session.passport.user });
  res.render("upload", {
    footer: true,
    user,
    category: req.query.category === "story" ? "story" : "post",
  });
});

router.post("/update", isLoggedIn, async function (req, res) {
  const user = await userModel.findOneAndUpdate(
    { username: req.session.passport.user },
    { username: req.body.username, name: req.body.name, bio: req.body.bio },
    { new: true }
  );
  req.login(user, function (err) {
    if (err) throw err;
    res.redirect("/profile");
  });
});

router.post( "/post", isLoggedIn, upload.single("image"),
  async function (req, res) {
    try {
      const user = await userModel.findOne({
        username: req.session.passport.user,
      });

      if (req.body.category === "post") {

        // Uploaded image path
        const imagePath = "./public/images/uploads/" + req.file.filename;

        console.log("Image:", req.file.filename);
        console.log("Mime:", req.file.mimetype);

        // AI Caption Generate
        const aiCaption = await generateCaption(
          imagePath,
          req.file.mimetype
        );

        console.log("AI Caption:", aiCaption);

        // User caption hai to wahi use karo,
        // warna AI caption use karo
        const finalCaption =
          req.body.caption && req.body.caption.trim() !== ""
            ? req.body.caption
            : aiCaption;

        // Save Post
        const post = await postModel.create({
          user: user._id,
          caption: finalCaption,
          picture: req.file.filename,
        });

        user.posts.push(post._id);

      } else if (req.body.category === "story") {

        const story = await storyModel.create({
        story: req.file.filename,
        caption: (req.body.caption || "").trim().slice(0, 200),
        user: user._id,
});

        user.stories.push(story._id);

      } else {
        return res.status(400).send("Invalid category");
      }

      await user.save();
      res.redirect("/feed");

    } catch (err) {
      console.error("Error:", err);
      res.status(500).send("Something went wrong");
    }
  }
);

router.post("/generate-caption",isLoggedIn, upload.single("image"),
  async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ caption: "", error: "No image uploaded" });
      }

      const imagePath = "./public/images/uploads/" + req.file.filename;

      const caption = await generateCaption(imagePath, req.file.mimetype);

      if (!caption) {
        return res.status(503).json({
          caption: "",
          error: "AI caption abhi available nahi hai, thodi der baad try karo",
        });
      }

      res.json({ caption });
    } catch (err) {
      console.error("Generate caption error:", err);
      res.status(500).json({ caption: "", error: "Something went wrong" });
    }
  }
);

router.post("/upload", isLoggedIn, upload.single("image"),
  async function (req, res) {
    const user = await userModel.findOne({
      username: req.session.passport.user,
    });
    user.picture = req.file.filename;
    await user.save();
    res.redirect("/edit");
  }
);


router.post("/register", function (req, res) {
  const user = new userModel({
    username: req.body.username,
    email: req.body.email,
    name: req.body.name,
  });

  userModel.register(user, req.body.password).then(function (registereduser) {
    passport.authenticate("local")(req, res, function () {
      res.redirect("/profile");
    });
  });
});

router.post( "/login",passport.authenticate("local", {
    successRedirect: "/feed",
    failureRedirect: "/login",
  }),
  function (req, res) {}
);

router.get("/logout", function (req, res, next) {
  req.logout(function (err) {
    if (err) {
      return next(err);
    }
    res.redirect("/login");
  });
});

function isLoggedIn(req, res, next) {
  if (req.isAuthenticated()) {
    return next();
  } else {
    res.redirect("/login");
  }
}

module.exports = router;
