require("dotenv").config();
const { GoogleGenAI } = require("@google/genai");

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

(async () => {
    console.log("Key loaded:", !!process.env.GEMINI_API_KEY);
    for (const model of ["gemini-2.5-flash", "gemini-2.5-flash-lite", "gemini-2.0-flash"]) {
        try {
            const r = await ai.models.generateContent({
                model,
                contents: "Say hello in one word",
            });
            console.log(model, "OK:", r.text);
        } catch (e) {
            console.log(model, "FAIL:", e.status, e.message);
        }
    }
})();
