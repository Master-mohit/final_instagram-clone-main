const mongoose = require("mongoose");

const storySchema = mongoose.Schema({
  story: String,
  caption: { type: String, default: "" },
  user: { type: mongoose.Schema.Types.ObjectId, ref: "user" },
  viewers: [
    {
      _id: false,
      user: { type: mongoose.Schema.Types.ObjectId, ref: "user" },
      at: { type: Date, default: Date.now },
    },
  ],
  likes: [{ type: mongoose.Schema.Types.ObjectId, ref: "user" }],
  createdAt: {
    type: Date,
    default: Date.now,
    expires: 60 * 60 * 24,
  },
});

module.exports = mongoose.model("story", storySchema);