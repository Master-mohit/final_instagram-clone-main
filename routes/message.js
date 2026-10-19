const mongoose = require("mongoose");

const messageSchema = mongoose.Schema({
  from: { type: mongoose.Schema.Types.ObjectId, ref: "user", index: true },
  to: { type: mongoose.Schema.Types.ObjectId, ref: "user", index: true },
  text: { type: String, required: true, maxlength: 1000 },
  read: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now },
});

messageSchema.index({ from: 1, to: 1, createdAt: -1 });

module.exports = mongoose.model("message", messageSchema);