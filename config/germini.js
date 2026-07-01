const { GoogleGenAI } = require("@google/genai");
const fs = require("fs");

console.log("API KEY:", process.env.GEMINI_API_KEY);

const ai = new GoogleGenAI({
    apiKey: process.env.GEMINI_API_KEY,
});

async function generateCaption(imagePath, mimeType) {

    const image = fs.readFileSync(imagePath);

    const response = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: [
            {
                inlineData: {
                    data: image.toString("base64"),
                    mimeType: mimeType,
                },
            },
            {
                text: "Generate a short Instagram caption for this image. Return only the caption.",
            },
        ],
    });

    return response.text;
}

module.exports = generateCaption;