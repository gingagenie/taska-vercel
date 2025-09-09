import { Router } from "express";
import { requireAuth } from "../middleware/auth";
import { requireOrg } from "../middleware/tenancy";
import { requireActiveSubscription } from "../middleware/subscription";
import OpenAI from "openai";
import { db } from "../db/client";
import { jobs, customers, equipment, jobEquipment } from "../../shared/schema";
import { eq, and } from "drizzle-orm";

const router = Router();

// Initialize OpenAI with API key
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Forklift technical knowledge base
const FORKLIFT_KNOWLEDGE = `
You are TaskaAI, a specialized technical assistant for forklift field service operations. You help technicians with:

EQUIPMENT EXPERTISE:
- All major forklift brands: Toyota, Caterpillar, Crown, Yale, Hyster, Nissan, Mitsubishi, TCM
- Engine types: Diesel, LPG, Electric, Hybrid systems
- Common components: Hydraulic systems, mast assemblies, transmissions, brakes, electrical systems
- Diagnostic procedures and troubleshooting workflows

TECHNICAL ASSISTANCE:
- Step-by-step repair procedures
- Safety protocols and requirements
- Parts identification and specifications  
- Diagnostic code interpretation
- Maintenance schedules and procedures

WORKFLOW GUIDANCE:
- Job prioritization strategies
- Customer communication best practices
- Documentation requirements
- Quality control checklists
- Time management for field service

Always provide:
1. Clear, actionable steps
2. Safety warnings when relevant
3. Parts/tools needed
4. Estimated time requirements
5. When to escalate to senior technician

Keep responses concise but thorough. Ask clarifying questions when needed.
`;

// AI Chat endpoint
router.post("/chat", requireAuth, requireOrg, requireActiveSubscription, async (req, res) => {
  try {
    const { message, conversationHistory = [] } = req.body;
    const orgId = req.orgId!;
    const userId = req.user!.id;

    if (!message?.trim()) {
      return res.status(400).json({ error: "Message is required" });
    }

    // Get user's recent jobs and equipment for context
    const [userJobs, orgEquipment] = await Promise.all([
      db.select({
        id: jobs.id,
        title: jobs.title,
        description: jobs.description,
        status: jobs.status
      })
      .from(jobs)
      .where(and(
        eq(jobs.orgId, orgId),
        eq(jobs.status, 'in_progress')
      ))
      .limit(5),
      
      db.select({
        id: equipment.id,
        name: equipment.name,
        make: equipment.make,
        model: equipment.model,
        serial: equipment.serial
      })
      .from(equipment)
      .where(eq(equipment.orgId, orgId))
      .limit(10)
    ]);

    // Build context from user data
    let contextInfo = "\nCURRENT CONTEXT:\n";
    
    if (userJobs.length > 0) {
      contextInfo += "Active Jobs:\n";
      userJobs.forEach(job => {
        contextInfo += `- ${job.title}: ${job.description}\n`;
      });
    }
    
    if (orgEquipment.length > 0) {
      contextInfo += "\nEquipment in System:\n";
      orgEquipment.forEach(eq => {
        contextInfo += `- ${eq.name} (${eq.make} ${eq.model} - Serial: ${eq.serial || 'N/A'})\n`;
      });
    }

    // Prepare conversation for OpenAI
    const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
      {
        role: "system",
        content: FORKLIFT_KNOWLEDGE + contextInfo
      }
    ];

    // Add conversation history (last 10 messages for context)
    const recentHistory = conversationHistory.slice(-10);
    messages.push(...recentHistory);

    // Add current user message
    messages.push({
      role: "user", 
      content: message
    });

    // Get AI response using latest model
    const completion = await openai.chat.completions.create({
      model: "gpt-4", // Using GPT-4 for best technical accuracy
      messages,
      max_tokens: 800,
      temperature: 0.3, // Lower temperature for more consistent technical responses
    });

    const aiResponse = completion.choices[0]?.message?.content;

    if (!aiResponse) {
      throw new Error("No response from AI");
    }

    res.json({
      response: aiResponse,
      timestamp: new Date().toISOString(),
      tokensUsed: completion.usage?.total_tokens || 0
    });

  } catch (error: any) {
    console.error("AI Chat error:", error);
    
    if (error.code === 'insufficient_quota') {
      return res.status(402).json({ 
        error: "AI service quota exceeded. Please contact support." 
      });
    }
    
    if (error.code === 'rate_limit_exceeded') {
      return res.status(429).json({ 
        error: "Too many requests. Please wait a moment and try again." 
      });
    }

    res.status(500).json({ 
      error: "AI service temporarily unavailable. Please try again." 
    });
  }
});

// Health check for AI service
router.get("/status", requireAuth, async (req, res) => {
  try {
    // Test OpenAI connection with a simple request
    const completion = await openai.chat.completions.create({
      model: "gpt-4",
      messages: [{ role: "user", content: "Test connection" }],
      max_tokens: 10
    });

    res.json({
      status: "operational",
      model: "gpt-4",
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(503).json({
      status: "unavailable",
      error: "AI service connection failed"
    });
  }
});

export { router as aiSupportRouter };