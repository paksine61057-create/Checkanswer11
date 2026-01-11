
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
  
  if (!apiKey || apiKey === "undefined" || apiKey === "") {
    throw new Error("ไม่พบ API Key ในระบบ กรุณาตรวจสอบการตั้งค่าใน Environment Variables");
  }

  const ai = new GoogleGenAI({ apiKey });
  const modelName = 'gemini-3-flash-preview';
  
  const promptText = `คุณคือผู้เชี่ยวชาญด้าน OCR สำหรับตรวจข้อสอบ
วิเคราะห์รูปภาพกระดาษคำตอบนี้และดึงตัวเลือกที่นักเรียนระบุ (ก, ข, ค, ง)
สำหรับข้อที่ 1 ถึง ${totalQuestions}

ส่งกลับมาในรูปแบบ JSON เท่านั้น ห้ามมีคำอธิบายอื่นหรือคำพูดนำหน้าใดๆ ทั้งสิ้น:
{
  "detectedAnswers": ["ก", "ข", "", "ง", ...],
  "confidence": 0.98
}
- ความยาวของ array ต้องเท่ากับ ${totalQuestions}
- หากข้อใดไม่ชัดเจนให้ใส่เป็นค่าว่าง ""`;

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
          { text: promptText },
        ],
      },
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            detectedAnswers: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
              description: "Array ของตัวเลือกที่ตรวจพบ"
            },
            confidence: {
              type: Type.NUMBER,
              description: "ค่าความแม่นยำ 0-1"
            }
          },
          required: ["detectedAnswers", "confidence"],
        },
      },
    });

    let output = response.text || "";
    
    // ทำความสะอาดข้อความ เผื่อโมเดลส่งคำว่า launch! หรือ markdown block มา
    const jsonMatch = output.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error("โมเดลไม่ได้ส่งข้อมูลในรูปแบบที่ถูกต้อง");
    }
    
    const data = JSON.parse(jsonMatch[0]);
    let answers = Array.isArray(data.detectedAnswers) ? data.detectedAnswers : [];

    // ปรับขนาดข้อมูลให้ตรงกับจำนวนข้อ
    if (answers.length < totalQuestions) {
      answers = [...answers, ...new Array(totalQuestions - answers.length).fill("")];
    } else {
      answers = answers.slice(0, totalQuestions);
    }

    return {
      detectedAnswers: answers.map((a: any) => {
        const s = String(a || "").trim();
        return answerOptions.includes(s) ? s : "";
      }),
      confidence: data.confidence || 0,
    };
  } catch (error: any) {
    console.error("Gemini Error:", error);
    throw new Error(`การสแกนล้มเหลว: ${error.message}`);
  }
}
