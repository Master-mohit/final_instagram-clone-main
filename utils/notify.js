const notificationModel = require("../routes/notification");

async function notify({ to, from, type, post = null, text = "" }) {
  try {
    if (!to || !from || to.toString() === from.toString()) return;

    // Like/follow baar-baar toggle ho to duplicate notification na bane
    if (["like", "follow", "story_like"].includes(type)) {
      const exists = await notificationModel.findOne({ to, from, type, post });
      if (exists) return;
    }

    await notificationModel.create({
      to,
      from,
      type,
      post,
      text: (text || "").slice(0, 100),
    });
  } catch (err) {
    console.error("Notify error:", err.message);
  }
}

async function removeNotification({ to, from, type, post = null }) {
  try {
    await notificationModel.deleteMany({ to, from, type, post });
  } catch (err) {
    console.error("Remove notification error:", err.message);
  }
}

module.exports = { notify, removeNotification };