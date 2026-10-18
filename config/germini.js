const { GoogleGenAI } = require("@google/genai");
const fs = require("fs");

const ai = new GoogleGenAI({
    apiKey: process.env.GEMINI_API_KEY,
});

// Pehle main model, phir fallback models
const MODELS = ["gemini-2.5-flash", "gemini-3.5-flash-lite", "gemini-3.8-flash"];
const MAX_RETRIES = 3;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Ye errors temporary hote hain, retry karna safe hai
const isRetryable = (err) => [429, 500, 503, 504].includes(err?.status);

async function generateCaption(imagePath, mimeType) {
    try {
        const image = fs.readFileSync(imagePath);
        const base64 = image.toString("base64");

        for (const model of MODELS) {
            for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
                try {
                    const response = await ai.models.generateContent({
                        model,
                        contents: [
                            {
                                inlineData: {
                                    data: base64,
                                    mimeType: mimeType,
                                },
                            },
                            {
                                text: "Generate a short Instagram caption for this image. Return only the caption.",
                            },
                        ],
                    });

                    return (response.text || "").trim();
                } catch (err) {
                    console.error(
                        `Gemini error [${model}] attempt ${attempt}/${MAX_RETRIES}:`,
                        err.status || err.message
                    );

                    // 404 = model nahi mila, next model try karo
                    if (err?.status === 404) break;

                    // 400/403 = key ya request ka issue, retry bekaar hai
                    if (!isRetryable(err)) return "";

                    if (attempt < MAX_RETRIES) {
                        await sleep(1000 * 2 ** (attempt - 1));
                    }
                }
            }
            console.warn(`${model} fail hua, next model try kar raha hu...`);
        }
    } catch (err) {
        console.error("generateCaption failed:", err.message);
    }

    // Sab fail ho gaya to empty caption, app crash nahi hoga
    return "";
}

module.exports = generateCaption;