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



router.get("/story", isLoggedIn, async function (req, res) {
  try {
    const user = await userModel.findOne({ username: req.session.passport.user }).populate('stories');
    console.log(user); 
    res.render("story", { footer: false, user });
  } catch (err) {
    console.error(err);
    res.status(500).send("Internal Server Error");
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

  let stories = await storyModel.find({ user: { $ne: user._id } })
  .populate("user");

  var uniq = {};
 var filtered = stories.filter(item => {
  if (item.user && !uniq[item.user.id]) {
    uniq[item.user.id] = " ";
    return true;
  } else return false;
});


  let posts = await postModel.find().populate("user");

  res.render("feed", {
    footer: true,
    user,
    posts,
    stories: filtered,
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

router.post(
  "/post",
  isLoggedIn,
  upload.single("image"),
  async function (req, res) {
    const user = await userModel.findOne({
      username: req.session.passport.user,
    });

    if (req.body.category === "post") {
      const post = await postModel.create({
        user: user._id,
        caption: req.body.caption,
        picture: req.file.filename,
      });
      user.posts.push(post._id);
    } else if (req.body.category === "story") {
      let story = await storyModel.create({
        story: req.file.filename,
        user: user._id,
      });
      user.stories.push(story._id);
    } else {
      res.send("tez mat chalo");
    }

    await user.save();
    res.redirect("/feed");
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
