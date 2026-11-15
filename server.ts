import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { GoogleGenAI } from '@google/genai';
import { CUSTOMER_SYSTEM_PROMPT, COACH_SYSTEM_PROMPT } from './shared/prompts';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const port = process.env.PORT || 3000;

app.use(express.json({ limit: '10mb' }));

// Initialize Gemini Client
const apiKey = process.env.GEMINI_API_KEY;
let genAI: GoogleGenAI | null = null;
if (apiKey) {
  genAI = new GoogleGenAI({
    apiKey: apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

// API endpoint for customer chat reply
app.post('/api/chat', async (req, res) => {
  try {
    const { scenario, messages, lastAdminMessage } = req.body;

    if (!genAI) {
      return res.status(500).json({
        error: 'GEMINI_API_KEY is not configured on the server.',
      });
    }

    const conversationContext = messages
      .map((m: { sender: string; text: string }) => `${m.sender === 'admin' ? 'แอดมิน' : 'ลูกค้า'}: ${m.text}`)
      .join('\n');

    const prompt = `
สถานการณ์จำลอง (Scenario):
- ชื่อสถานการณ์: ${scenario.title}
- บทบาทลูกค้า: ${scenario.customerName} (${scenario.customerProfile})
- วัตถุประสงค์ของลูกค้า: ${scenario.customerGoal}
- งบประมาณในใจ: ${scenario.budget} บาท
- จุดส่งปลายทาง: ${scenario.destination}
- เงื่อนไขพิเศษ: ${scenario.specialNotes || 'ไม่มี'}

ประวัติการสนทนาล่าสุด:
${conversationContext}

ข้อความล่าสุดจากแอดมิน:
"${lastAdminMessage}"

จงตอบกลับในบทบาทของลูกค้าคนนี้ตามสถานการณ์และข้อมูลข้างต้น โดยรักษาคาแรคเตอร์อย่างสมจริง และส่งผลลัพธ์เป็น JSON ตามที่กำหนด`;

    const response = await genAI.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
      config: {
        systemInstruction: CUSTOMER_SYSTEM_PROMPT,
        responseMimeType: 'application/json',
        temperature: 0.7,
      },
    });

    const responseText = response.text || '{}';
    let parsedData;
    try {
      parsedData = JSON.parse(responseText);
    } catch {
      parsedData = {
        customerReply: responseText,
        mood: 'neutral',
        currentStage: 'discovery',
        internalThought: 'ลูกค้ากำลังพิจารณาข้อเสนอ',
      };
    }

    res.json(parsedData);
  } catch (error: unknown) {
    console.error('Error generating chat response:', error);
    res.status(500).json({
      error: 'Failed to generate response',
      details: error instanceof Error ? error.message : String(error),
    });
  }
});

// API endpoint for real-time coaching evaluation
app.post('/api/evaluate', async (req, res) => {
  try {
    const { scenario, messages, lastAdminMessage } = req.body;

    if (!genAI) {
      return res.status(500).json({
        error: 'GEMINI_API_KEY is not configured on the server.',
      });
    }

    const conversationContext = messages
      .map((m: { sender: string; text: string }) => `${m.sender === 'admin' ? 'แอดมิน' : 'ลูกค้า'}: ${m.text}`)
      .join('\n');

    const prompt = `
บริบทสถานการณ์:
- สถานการณ์: ${scenario.title}
- งบประมาณลูกค้า: ${scenario.budget} บาท
- จุดหมาย: ${scenario.destination}
- ประเภท: ${scenario.category}

ประวัติการคุย:
${conversationContext}

ข้อความล่าสุดของแอดมินที่ต้องประเมิน:
"${lastAdminMessage}"

จงประเมินข้อความนี้อย่างละเอียดและให้คำแนะนำที่เป็นประโยชน์ต่อแอดมิน`;

    const response = await genAI.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
      config: {
        systemInstruction: COACH_SYSTEM_PROMPT,
        responseMimeType: 'application/json',
        temperature: 0.3,
      },
    });

    const responseText = response.text || '{}';
    let parsedData;
    try {
      parsedData = JSON.parse(responseText);
    } catch {
      parsedData = {
        score: 75,
        endedWithQuestion: lastAdminMessage.trim().endsWith('?') || lastAdminMessage.includes('ไหม') || lastAdminMessage.includes('คะ') || lastAdminMessage.includes('ครับ'),
        detectedPhase: 'need_discovery',
        checklistStatus: {},
        feedback: 'ประเมินเบื้องต้น: พยายามจบประโยคด้วยคำถามเสมอเพื่อรักษาการสนทนา',
        goldenRulePassed: true,
        praise: 'ตอบสนองอย่างรวดเร็วและสุภาพ',
        improvement: 'ระบุข้อมูลเพิ่มเติมตาม SOP',
      };
    }

    res.json(parsedData);
  } catch (error: unknown) {
    console.error('Error evaluating message:', error);
    res.status(500).json({
      error: 'Failed to evaluate',
      details: error instanceof Error ? error.message : String(error),
    });
  }
});

// Vite dev middleware or static serve in production
async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.resolve(__dirname, 'dist')));
    app.get('*', (req, res) => {
      res.sendFile(path.resolve(__dirname, 'dist', 'index.html'));
    });
  }

  app.listen(port, () => {
    console.log(`Server running on port ${port}`);
  });
}

startServer();
