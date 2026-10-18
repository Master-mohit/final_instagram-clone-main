const mongoose = require("mongoose");

const commentSchema = mongoose.Schema({
  text: { type: String, required: true, maxlength: 500 },

  user: { type: mongoose.Schema.Types.ObjectId, ref: "user" },

  post: { type: mongoose.Schema.Types.ObjectId, ref: "post" },

  parent: { type: mongoose.Schema.Types.ObjectId, ref: "comment", default: null },

  likes: [{ type: mongoose.Schema.Types.ObjectId, ref: "user" }],
  
  createdAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model("comment", commentSchema);