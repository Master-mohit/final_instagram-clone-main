const mongoose = require("mongoose");

const notificationSchema = mongoose.Schema({
  to: { type: mongoose.Schema.Types.ObjectId, ref: "user", index: true },
  from: { type: mongoose.Schema.Types.ObjectId, ref: "user" },
  type: {
    type: String,
    enum: ["like", "comment", "reply", "follow", "story_like"],
  },
  post: { type: mongoose.Schema.Types.ObjectId, ref: "post", default: null },
  text: { type: String, default: "" },
  read: { type: Boolean, default: false },
  createdAt: {
    type: Date,
    default: Date.now,
    expires: 60 * 60 * 24 * 30, 
  },
});

module.exports = mongoose.model("notification", notificationSchema);