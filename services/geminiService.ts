
import { GoogleGenAI, Type } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

export interface ScanResponse {
  detectedAnswers: string[];
  confidence: number;
}

export async function scanExamPaper(
  base64Image: string,
  totalQuestions: number,
  answerOptions: string[] = ["ก", "ข", "ค", "ง"]
): Promise<ScanResponse> {
  const model = 'gemini-3-flash-preview';
  
  const prompt = `
    Analyze this exam paper image. Extract the student's selected answers for ${totalQuestions} questions.
    The student marks the answers using Thai characters: ${answerOptions.join(', ')}.
    If a question is skipped or the mark is unclear, return null for that answer.
    Focus on finding question numbers 1 to ${totalQuestions} and their corresponding marks.
    Ensure accuracy in OCR for Thai characters like 'ก', 'ข', 'ค', 'ง'.
  `;

  const response = await ai.models.generateContent({
    model: model,
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
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          detectedAnswers: {
            type: Type.ARRAY,
            items: { type: Type.STRING, nullable: true },
            description: "List of detected answer choices (e.g., 'ก', 'ข') corresponding to question index."
          },
          confidence: {
            type: Type.NUMBER,
            description: "Confidence level of the extraction (0 to 1)."
          }
        },
        required: ["detectedAnswers", "confidence"],
      },
    },
  });

  try {
    const data = JSON.parse(response.text || '{}');
    return {
      detectedAnswers: data.detectedAnswers || [],
      confidence: data.confidence || 0,
    };
  } catch (error) {
    console.error("Failed to parse Gemini response:", error);
    throw new Error("ไม่สามารถประมวลผลข้อมูลจากรูปภาพได้");
  }
}
