
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
  // Use the global process.env.API_KEY directly
  const apiKey = process.env.API_KEY;
  
  if (!apiKey || apiKey === "undefined" || apiKey === "") {
    throw new Error("ไม่พบ API Key ในระบบ กรุณาตรวจสอบการตั้งค่า Environment Variable ใน Vercel");
  }

  const ai = new GoogleGenAI({ apiKey });
  const modelName = 'gemini-3-flash-preview';
  
  const prompt = `คุณคือผู้เชี่ยวชาญด้านการตรวจข้อสอบ (Exam Grader)
หน้าที่ของคุณคืออ่านรูปภาพกระดาษคำตอบและดึงข้อมูลคำตอบของนักเรียนออกมา
ข้อสอบมีทั้งหมด ${totalQuestions} ข้อ
ตัวเลือกที่นักเรียนสามารถเลือกได้คือ: ${answerOptions.join(', ')}

คำแนะนำในการทำงาน:
1. ตรวจสอบหมายเลขข้อ 1 ถึง ${totalQuestions}
2. ระบุตัวอักษรภาษาไทย (ก, ข, ค, ง) ที่นักเรียนเลือกในแต่ละข้อ
3. หากข้อใดนักเรียนไม่ได้ตอบ หรืออ่านไม่ออก ให้ระบุเป็น null ใน JSON
4. ให้คำตอบออกมาเป็น JSON ตามโครงสร้างที่กำหนดเท่านั้น ห้ามมีคำอธิบายอื่น

โครงสร้างข้อมูลที่ต้องการ:
{
  "detectedAnswers": ["ก", "ข", null, "ง", ...],
  "confidence": 0.95
}`;

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
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            detectedAnswers: {
              type: Type.ARRAY,
              items: { type: Type.STRING, nullable: true },
              description: "รายการคำตอบที่ตรวจพบ เรียงตามลำดับข้อ"
            },
            confidence: {
              type: Type.NUMBER,
              description: "ค่าความเชื่อมั่นในการอ่าน (0.0 - 1.0)"
            }
          },
          required: ["detectedAnswers", "confidence"],
        },
      },
    });

    const resultText = response.text;
    if (!resultText) {
      throw new Error("โมเดลไม่ตอบสนองข้อมูล (Empty Response)");
    }

    const data = JSON.parse(resultText);
    
    // จัดการข้อมูลให้ตรงกับจำนวนข้อที่กำหนด
    let answers = Array.isArray(data.detectedAnswers) ? data.detectedAnswers : [];
    
    // ปรับขนาด Array ให้เท่ากับจำนวนข้อสอบจริงเพื่อป้องกัน Error ตอนเปรียบเทียบ
    if (answers.length < totalQuestions) {
      const padding = new Array(totalQuestions - answers.length).fill(null);
      answers = [...answers, ...padding];
    } else if (answers.length > totalQuestions) {
      answers = answers.slice(0, totalQuestions);
    }

    return {
      detectedAnswers: answers.map((a: any) => (a === null || a === undefined) ? "" : String(a).trim()),
      confidence: data.confidence || 0,
    };
  } catch (error: any) {
    console.error("Gemini Scan Service Error:", error);
    let errorMessage = "การประมวลผลล้มเหลว";
    if (error.message.includes("API Key") || error.message.includes("401") || error.message.includes("403")) {
      errorMessage = "API Key ไม่ถูกต้องหรือยังไม่ได้ตั้งค่า (Permission Denied)";
    } else if (error.message.includes("JSON")) {
      errorMessage = "โมเดลส่งข้อมูลกลับมาผิดรูปแบบ กรุณาปรับแสงสว่างและลองใหม่";
    }
    
    throw new Error(`${errorMessage} (${error.message})`);
  }
}
