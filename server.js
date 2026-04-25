require('dotenv').config();
const express = require('express');
const cors = require('cors');
const Groq = require('groq-sdk');
const multer = require('multer');
const { v4: uuidv4 } = require('uuid');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

// ─── Create uploads directory if it doesn't exist (for Vercel compatibility) ──
const uploadsDir = process.env.VERCEL ? '/tmp/uploads' : 'uploads';
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const client = new Groq({ apiKey: process.env.GROQ_API_KEY });

// ─── In-memory stores (replace with DB in production) ────────────────────────
let businesses = {};   // { id: { name, description, services, prices, locations, features, leads, bookings } }
let sessions   = {};   // { sessionId: { mode, history, businessContext } }

// ─── Multer for file uploads ──────────────────────────────────────────────────
const upload = multer({ dest: uploadsDir });

// ─── System prompts ───────────────────────────────────────────────────────────
const INFO_PROMPT = `You are AIKol — a friendly, knowledgeable travel guide for Kyrgyzstan.
You help tourists discover the beauty of Kyrgyzstan: mountains, culture, food, Bishkek city, Issyk-Kul lake, Ala-Archa, and more.
Be warm, enthusiastic, and conversational. Answer in the same language the tourist uses.
When you mention specific hotels, tours, or prices — be general unless you have specific business data.
Occasionally (naturally, not pushy) mention that you can help with actual bookings.`;

const BOOKING_PROMPT = (ctx) => `You are AIKol — a personal travel manager for Kyrgyzstan.
The tourist is READY to book. Your job is to:
1. Understand exactly what they need (dates, people count, budget, preferences)
2. Present specific options from our partner businesses
3. Confirm details and create a booking request
4. Be professional but warm

${ctx ? `AVAILABLE BUSINESSES & SERVICES:\n${ctx}` : 'Use general knowledge about Kyrgyzstan tourism options.'}

Always collect: name, contact info (email/phone), dates, number of people.
When all info collected, say "BOOKING_CONFIRMED" and summarize.
Answer in the same language the tourist uses.`;

const BUSINESS_AGENT_PROMPT = (business) => `You are an AI representative for "${business.name}".
Business description: ${business.description}
Services offered: ${business.services}
Pricing: ${business.prices}
Locations: ${business.locations}
Special features: ${business.features}

Answer tourist questions ONLY based on this information. Do NOT make up facts.
If you don't have the information, say so politely and suggest contacting the business directly.
Be professional, helpful, and represent the brand well.
Answer in the same language the tourist uses.`;

// ─── Helper: build business context string ────────────────────────────────────
function buildBusinessContext() {
  return Object.values(businesses).map(b =>
    `Business: ${b.name}\nDescription: ${b.description}\nServices: ${b.services}\nPrices: ${b.prices}\nLocations: ${b.locations}`
  ).join('\n\n---\n\n');
}

// ══════════════════════════════════════════════════════════════════════════════
//  B2C TOURIST ROUTES
// ══════════════════════════════════════════════════════════════════════════════

// Start or continue a tourist chat session
app.post('/api/chat', async (req, res) => {
  const { sessionId, message, mode } = req.body;
  if (!message) return res.status(400).json({ error: 'Message required' });

  const sid = sessionId || uuidv4();
  if (!sessions[sid]) sessions[sid] = { mode: 'info', history: [] };

  const session = sessions[sid];
  if (mode) session.mode = mode;

  session.history.push({ role: 'user', content: message });

  const systemPrompt = session.mode === 'booking'
    ? BOOKING_PROMPT(buildBusinessContext())
    : INFO_PROMPT;

  try {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    // Send session ID first
    res.write(`data: ${JSON.stringify({ type: 'session', sessionId: sid })}\n\n`);

    const stream = await client.chat.completions.create({
      model: 'llama-3.3-70b-versatile',
      messages: [
        { role: 'system', content: systemPrompt },
        ...session.history.slice(-20)
      ],
      temperature: 0.7,
      max_tokens: 2048,
      top_p: 1,
      stream: true,
      stop: null
    });

    let fullResponse = '';
    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta?.content || '';
      if (delta) {
        fullResponse += delta;
        res.write(`data: ${JSON.stringify({ type: 'token', content: delta })}\n\n`);
      }
    }

    session.history.push({ role: 'assistant', content: fullResponse });

    // Check if booking was confirmed
    if (session.mode === 'booking' && fullResponse.includes('BOOKING_CONFIRMED')) {
      const bookingId = uuidv4().slice(0, 8).toUpperCase();
      // Store lead to all mentioned businesses (simplified: store globally)
      const lead = {
        id: bookingId,
        timestamp: new Date().toISOString(),
        conversation: fullResponse,
        status: 'pending'
      };
      Object.values(businesses).forEach(b => {
        if (!b.leads) b.leads = [];
        b.leads.push(lead);
      });
      res.write(`data: ${JSON.stringify({ type: 'booking', bookingId })}\n\n`);
    }

    res.write('data: [DONE]\n\n');
    res.end();
  } catch (err) {
    console.error('Groq error:', err);
    res.write(`data: ${JSON.stringify({ type: 'error', message: err.message })}\n\n`);
    res.end();
  }
});

// Switch chat mode
app.post('/api/session/:sid/mode', (req, res) => {
  const { sid } = req.params;
  const { mode } = req.body;
  if (sessions[sid]) {
    sessions[sid].mode = mode;
    res.json({ ok: true, mode });
  } else {
    res.status(404).json({ error: 'Session not found' });
  }
});

// ══════════════════════════════════════════════════════════════════════════════
//  B2B BUSINESS ROUTES
// ══════════════════════════════════════════════════════════════════════════════

// Register business
app.post('/api/business/register', (req, res) => {
  const { name, email, password, category } = req.body;
  if (!name || !email || !password) {
    return res.status(400).json({ error: 'Name, email and password are required' });
  }
  
  // Check if email already exists
  const existing = Object.values(businesses).find(b => b.email.toLowerCase() === email.toLowerCase());
  if (existing) {
    return res.status(400).json({ error: 'Business with this email already exists' });
  }

  const id = uuidv4();
  businesses[id] = {
    id, name, email, password, category,
    description: '', services: '', prices: '', locations: '', features: '',
    leads: [], bookings: [],
    createdAt: new Date().toISOString(),
    analytics: { views: 0, inquiries: 0, conversions: 0 }
  };
  res.json({ ok: true, businessId: id, name });
});

// Login business
app.post('/api/business/login', (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password required' });
  }
  
  const biz = Object.values(businesses).find(b => 
    b.email.toLowerCase() === email.toLowerCase() && b.password === password
  );
  
  if (!biz) return res.status(401).json({ error: 'Invalid email or password' });
  res.json({ ok: true, businessId: biz.id, name: biz.name });
});

// Update business context/data
app.put('/api/business/:id/context', (req, res) => {
  const biz = businesses[req.params.id];
  if (!biz) return res.status(404).json({ error: 'Business not found' });
  const { description, services, prices, locations, features } = req.body;
  if (description !== undefined) biz.description = description;
  if (services !== undefined)    biz.services    = services;
  if (prices !== undefined)      biz.prices      = prices;
  if (locations !== undefined)   biz.locations   = locations;
  if (features !== undefined)    biz.features    = features;
  res.json({ ok: true });
});

// Get business dashboard data
app.get('/api/business/:id/dashboard', (req, res) => {
  const biz = businesses[req.params.id];
  if (!biz) return res.status(404).json({ error: 'Business not found' });

  // Simulate growing analytics
  biz.analytics.views += Math.floor(Math.random() * 5);
  biz.analytics.inquiries = biz.leads.length;
  biz.analytics.conversions = biz.bookings.length;

  res.json({
    name: biz.name,
    category: biz.category,
    analytics: biz.analytics,
    leads: biz.leads.slice(-10).reverse(),
    bookings: biz.bookings.slice(-10).reverse(),
    contextFilled: !!(biz.description && biz.services)
  });
});

// Business AI chat (for testing their own AI rep)
app.post('/api/business/:id/test-chat', async (req, res) => {
  const biz = businesses[req.params.id];
  if (!biz) return res.status(404).json({ error: 'Business not found' });
  const { message } = req.body;

  try {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.flushHeaders();

    const stream = await client.chat.completions.create({
      model: 'llama-3.3-70b-versatile',
      messages: [
        { role: 'system', content: BUSINESS_AGENT_PROMPT(biz) },
        { role: 'user', content: message }
      ],
      temperature: 0.7,
      max_tokens: 1024,
      top_p: 1,
      stream: true,
      stop: null
    });

    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta?.content || '';
      if (delta) res.write(`data: ${JSON.stringify({ content: delta })}\n\n`);
    }

    res.write('data: [DONE]\n\n');
    res.end();
  } catch (err) {
    res.write(`data: ${JSON.stringify({ error: err.message })}\n\n`);
    res.end();
  }
});

// Confirm a booking
app.post('/api/business/:id/bookings', (req, res) => {
  const biz = businesses[req.params.id];
  if (!biz) return res.status(404).json({ error: 'Business not found' });
  const booking = { id: uuidv4().slice(0, 8).toUpperCase(), ...req.body, status: 'confirmed', createdAt: new Date().toISOString() };
  biz.bookings.push(booking);
  res.json({ ok: true, booking });
});

// Seed demo business for demo purposes
function seedDemo() {
  const demoId = 'demo-hotel-123';
  if (!businesses[demoId]) {
    businesses[demoId] = {
      id: demoId,
      name: 'Grand Palace Hotel Bishkek',
      email: 'demo@hotel.kg',
      password: 'demo123',
      category: 'hotel',
      description: 'Luxury 5-star hotel in the heart of Bishkek with stunning mountain views. Opened in 2019.',
      services: 'Standard rooms, Deluxe suites, Presidential suite, Restaurant "Manas", Rooftop bar, Spa & wellness, Airport transfer, Tour desk',
      prices: 'Standard room: from $80/night, Deluxe suite: from $150/night, Presidential suite: $450/night, Airport transfer: $20',
      locations: 'Chui Avenue 123, Bishkek. 5 min from Ala-Too Square. 30 min from Manas Airport.',
      features: 'Free WiFi, Free breakfast included, Rooftop pool, Mountain views, 24/7 concierge, English/Russian/Chinese speaking staff',
      leads: [
        { id: 'ABC123', timestamp: new Date(Date.now() - 3600000).toISOString(), conversation: 'Tourist inquired about 3 nights for 2 people in July', status: 'pending' },
        { id: 'DEF456', timestamp: new Date(Date.now() - 7200000).toISOString(), conversation: 'Tourist asked about airport transfer and room prices', status: 'pending' }
      ],
      bookings: [
        { id: 'BK001', guestName: 'John Smith', dates: '2026-06-15 to 2026-06-18', room: 'Deluxe Suite', total: '$450', status: 'confirmed', createdAt: new Date(Date.now() - 86400000).toISOString() }
      ],
      createdAt: new Date().toISOString(),
      analytics: { views: 247, inquiries: 2, conversions: 1 }
    };
    console.log('Demo business seeded: email=demo@hotel.kg, password=demo123');
  }
}

seedDemo();

app.listen(PORT, () => {
  console.log(`🌍 AIKol Travel Platform running on http://localhost:${PORT}`);
  console.log(`📧 Demo B2B login: demo@hotel.kg / demo123`);
});
