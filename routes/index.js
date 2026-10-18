var express = require("express");
var router = express.Router();
const passport = require("passport");
const localStrategy = require("passport-local");
const userModel = require("./users");
const postModel = require("./posts");
const storyModel = require("./story");
passport.use(new localStrategy(userModel.authenticate()));
const upload = require("./multer");
const utils = require("../utils/utils");
const generateCaption = require("../config/germini");
const fs = require("fs");
const path = require("path");


// GET
router.get("/", function (req, res) {
  res.render("index", { footer: false });
});

router.get("/login", function (req, res) {
  res.render("login", { footer: false });
});

router.get('/comment/:id', isLoggedIn, async function(req, res, next) {
  try {
    const user = await userModel.findOne({ username: req.session.passport.user });
    const post = await postModel.findById(req.params.id).populate("user");
    
    res.render('comment', { post, user });
  } catch (error) {
    console.error(error);
    return res.status(500).send('Server Error');
  }
});

router.post('/comment/:id', isLoggedIn, async function(req, res, next) {
  try {
    const user = await userModel.findOne({ username: req.session.passport.user });
    const post = await postModel.findById(req.params.id).populate("user");
    
    const newComment = await commentModel.create({
      text: req.body.text,
      user: user._id,
      post: post._id
    });
    post.comments.push(newComment._id);
    await post.save();

    
    return res.status(200).json({ msg: 'Comment added successfully', comment: newComment });
  } catch (error) {
    console.error(error);
    return res.status(500).send('Server Error');
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


// Story dekhi: viewer record karo (owner khud count nahi hota)
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

// Story like / unlike
router.post("/story/:id/like", isLoggedIn, async function (req, res) {
  try {
    const user = await userModel.findOne({ username: req.session.passport.user });
    const story = await storyModel.findById(req.params.id);
    if (!story) return res.status(404).json({ error: "Story not found" });

    const idx = story.likes.findIndex((id) => id.toString() === user._id.toString());
    if (idx === -1) story.likes.push(user._id);
    else story.likes.splice(idx, 1);
    await story.save();

    res.json({ liked: idx === -1, count: story.likes.length });
  } catch (err) {
    console.error("Story like error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// Viewers list: sirf story ka owner dekh sakta hai
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


router.get("/like/:postid", async function (req, res) {
  const post = await postModel.findOne({ _id: req.params.postid });
  const user = await userModel.findOne({ username: req.session.passport.user });
  if (post.like.indexOf(user._id) === -1) {
    post.like.push(user._id);
  } else {
    post.like.splice(post.like.indexOf(user._id), 1);
  }
  await post.save();
  res.json(post);
});

router.get("/feed", isLoggedIn, async function (req, res) {
  let user = await userModel
    .findOne({ username: req.session.passport.user })
    .populate("posts");

  // Stories: apni + following, sirf pichle 24 ghante ki
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const storyDocs = await storyModel
    .find({
      user: { $in: [user._id, ...user.following] },
      createdAt: { $gte: since },
    })
    .populate("user", "username picture")
    .sort({ createdAt: 1 });

  const groupsMap = {};
  storyDocs.forEach(function (s) {
    if (!s.user) return;
    const key = s.user._id.toString();
    if (!groupsMap[key]) {
      groupsMap[key] = {
        userId: key,
        username: s.user.username,
        picture: s.user.picture,
        own: key === user._id.toString(),
        items: [],
      };
    }
  const me = user._id.toString();
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

  // Apni story sabse pehle
  const storyGroups = Object.values(groupsMap).sort(
    (a, b) => (b.own ? 1 : 0) - (a.own ? 1 : 0)
  );
  // <script> ke andar safe embed ke liye
  const storyData = JSON.stringify(storyGroups).replace(/</g, "\\u003c");

  let posts = await postModel
    .find({ user: { $in: [user._id, ...user.following] } })
    .populate("user")
    .sort({ _id: -1 });
  posts = posts.filter((p) => p.user);

  res.render("feed", {
    footer: true,
    user,
    posts,
    storyGroups,
    storyData,
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
    res.redirect("/profile");
  }

  let userprofile = await userModel
    .findOne({ username: req.params.user })
    .populate("posts");

  res.render("userprofile", { footer: true, userprofile, user });
});

router.get("/follow/:userid", isLoggedIn, async function (req, res) {
  let followKarneWaala = await userModel.findOne({
    username: req.session.passport.user,
  });

  let followHoneWaala = await userModel.findOne({ _id: req.params.userid });

  if (followKarneWaala.following.indexOf(followHoneWaala._id) !== -1) {
    let index = followKarneWaala.following.indexOf(followHoneWaala._id);
    followKarneWaala.following.splice(index, 1);

    let index2 = followHoneWaala.followers.indexOf(followKarneWaala._id);
    followHoneWaala.followers.splice(index2, 1);
  } else {
    followHoneWaala.followers.push(followKarneWaala._id);
    followKarneWaala.following.push(followHoneWaala._id);
  }

  await followHoneWaala.save();
  await followKarneWaala.save();

  res.redirect("back");
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
  res.render("upload", { footer: true, user });
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

router.post(
  "/generate-caption",
  isLoggedIn,
  upload.single("image"),
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

router.post(
  "/upload",
  isLoggedIn,
  upload.single("image"),
  async function (req, res) {
    const user = await userModel.findOne({
      username: req.session.passport.user,
    });
    user.picture = req.file.filename;
    await user.save();
    res.redirect("/edit");
  }
);

// POST

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

router.post(
  "/login",
  passport.authenticate("local", {
    successRedirect: "/feed",
    failureRedirect: "/login",
  }),
  function (req, res) {}
);

router.get("/logout", function (req, res) {
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
