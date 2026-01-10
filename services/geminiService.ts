
import { GoogleGenAI, Type } from "@google/genai";

export interface ScanResponse {
  detectedAnswers: string[];
  confidence: number;
}

export async function scanExamPaper(
  base64Image: string,
  totalQuestions: number,
  answerOptions: string[] = ["ก", "ข", "ค", "ง"]
): Promise<ScanResponse> {
  const apiKey = process.env.API_KEY;
  
  if (!apiKey || apiKey === "undefined") {
    throw new Error("API Key is missing. Please configure it in your environment.");
  }

  const ai = new GoogleGenAI({ apiKey });
  const modelName = 'gemini-3-flash-preview';
  
  const systemInstruction = `You are a professional exam grader. 
Your task is to perform OCR on a student's exam paper image.
The exam uses Thai multiple-choice options: ${answerOptions.join(', ')}.
You must identify and extract the student's marks for questions 1 to ${totalQuestions}.
If a student marks multiple answers or if it's illegible, return null for that question.
Strictly return the results as a JSON array of strings corresponding to the marks.`;

  const prompt = `Analyze this image and list the answers for ${totalQuestions} questions. Make sure to only return the JSON data based on the schema provided.`;

  try {
    const response = await ai.models.generateContent({
      model: modelName,
      contents: {
        parts: [
          {
            inlineData: {
              mimeType: 'image/jpeg',
              data: base64Image,
            },
          },
          { text: prompt },
        ],
      },
      config: {
        systemInstruction,
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            detectedAnswers: {
              type: Type.ARRAY,
              items: { type: Type.STRING, nullable: true },
              description: "Array of extracted Thai characters (ก, ข, ค, ง) for each question."
            },
            confidence: {
              type: Type.NUMBER,
              description: "OCR confidence level from 0.0 to 1.0"
            }
          },
          required: ["detectedAnswers", "confidence"],
        },
      },
    });

    const responseText = response.text;
    if (!responseText) {
      throw new Error("No response text from Gemini");
    }

    // Attempt to parse JSON
    const data = JSON.parse(responseText.trim());
    
    // Validate and fix result length
    let answers = Array.isArray(data.detectedAnswers) ? data.detectedAnswers : [];
    if (answers.length < totalQuestions) {
      answers = [...answers, ...Array(totalQuestions - answers.length).fill(null)];
    } else if (answers.length > totalQuestions) {
      answers = answers.slice(0, totalQuestions);
    }

    return {
      detectedAnswers: answers,
      confidence: data.confidence || 0.5,
    };
  } catch (error: any) {
    console.error("Gemini Scan Error:", error);
    throw new Error(`การสแกนล้มเหลว: ${error.message || "ปัญหาทางเทคนิค"}`);
  }
}
