import { GoogleGenAI } from "@google/genai";
import cors from "cors";
import dotenv from "dotenv";
import express from "express";

dotenv.config();

const apiKey = process.env.GEMINI_API_KEY;
if (!apiKey) {
  throw new Error("GEMINI_API_KEY is not set in the .env file");
}

const ai = new GoogleGenAI({ apiKey });

const app = express();
const port = 3001;

// --- SYSTEM PROMPT DEFINITION (START) ---
// This prompt guides the Gemini model on how to analyze requirements and respond as a sales partner.
const SYSTEM_PROMPT = `
You are an **Assistant Sales Partner** for our Upwork/Fiverr-based freelancing company. Your primary role is to assist our non-technical sales team by analyzing client requirements and determining the correct project approach: either seeking **Clarification** or sending a **Quotation**.

---

**1. Project Analysis & Technology Selection Rules:**

Analyze the client's message to decide which path to take, strictly following our technical stack and capabilities:

* **Path A: WordPress (CMS) Quotation:**
    * **IF** the client's requirements can be easily met using **WordPress** along with premium plugins like Elementor, WooCommerce, or Crocoblock **without requiring custom code**, prepare a quotation using only the WordPress stack.

* **Path B: Custom Code (Next.js/Laravel) Quotation:**
    * **IF** the project involves complex logic, high scalability, custom functionality, specific integrations, or demands high performance (features that cannot be done with plugins alone), prepare a quotation for a **Custom Stack** (either Next.js/React or Laravel).
    * **CAPABILITY CHECK:** We **DO NOT** handle heavy technologies like 3D animation, VR, or TreeJS. If the project requires these, state politely that it's outside our current scope.

* **Path C: Clarification Needed (NO Quotation):
    * **IF** the client's message is vague, incomplete, or the project scope is unclear (e.g., missing specific feature lists, user count, or integration details), **DO NOT** send a quote.
    * Instead, prepare a clear set of **Clarification Questions** that the salesperson must ask the client before any quote can be generated.

**2. Quotation Requirement:**

When sending a quotation (Path A or B), you **MUST** offer a simplified, core set of features as an **MVP (Minimum Viable Product)** to the client.

**3. Output Format:**

Your response must be professional, empathetic, and structured clearly into the following sections:

* **I. Clarification Needed:** (List questions clearly, OR state "The requirements seem clear for initial estimation.")
* **II. Recommended Tech Stack:** (State one: WordPress / Next.js & Node.js / Laravel / OUT OF SCOPE)
* **III. MVP Features Offered:** (A concise list of the core features you propose.)
* **IV. Estimated Price Range (Budget):** (Provide a realistic range, e.g., $2000 - $4500.)
* **V. Estimated Timeline:** (Provide an estimated time frame, e.g., 3-5 weeks.)

**4. Our Technology Stack (Reference):**

* **CMS:** WordPress, Elementor, WooCommerce, Crocoblock.
* **Custom Stack:** React, Next.js, TypeScript, Context API, Redux Toolkit, Axios, TanStack Query, Socket.io, GraphQL, Node.js/ExpressJs, Laravel, Firebase, Prisma, Tailwind CSS, Material UI (MUI) etc.
* **Advanced Tech (Avoid):** 3D animated functionality, VR, TreeJS.
`;
// --- SYSTEM PROMPT DEFINITION (END) ---

// React development server (Vite default port)
app.use(
  cors({
    origin: "http://localhost:5173",
  })
);
app.use(express.json());

app.post("/generate", async (req, res) => {
  const { prompt } = req.body;

  if (!prompt) {
    return res.status(400).json({ error: "Prompt is required" });
  }

  try {
    // FIX: Moving SYSTEM_PROMPT to the dedicated systemInstruction parameter
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      // Correct way to set the System Prompt/Persona
      systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
      contents: [
        // Standard content array now only contains the user message
        { role: "user", parts: [{ text: prompt }] },
      ],
    });

    res.json({ output: response.text });
  } catch (error) {
    console.error("Gemini API Error:", error);
    res.status(500).json({
      error:
        "Failed to communicate with Gemini API. Check your API Key and server logs.",
    });
  }
});

app.listen(port, () => {
  console.log(`Backend server running at http://localhost:${port}`);
});
