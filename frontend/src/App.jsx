import { useState, useEffect, useRef } from "react";

// Finite states for the 3-step flow
const STEP = {
  CLARIFICATION: 0,
  TECH: 1,
  QUOTE: 2,
};

function App() {
  // Page routing: 'sales' (main flow) | 'fiverr'
  const [page, setPage] = useState('sales');
  // Quotation merged flow state
  const [quotationText, setQuotationText] = useState("");
  const [autoQuoteRequested, setAutoQuoteRequested] = useState(false);
  // Shared conversation log
  const [messages, setMessages] = useState([]); // {role:'user'|'ai', text:string}
  // Current input for active tab
  const [input, setInput] = useState("");
  // Current step/tab
  const [step, setStep] = useState(STEP.CLARIFICATION);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);

  // Parsed control signal from last AI response (NEXT header)
  const [nextSignal, setNextSignal] = useState(null); // clarification_needed | proceed_tech | proceed_quote | out_of_scope

  // Store requirement summary + chosen tech so later steps can display context
  const [requirementSummary, setRequirementSummary] = useState([]); // array of bullet lines
  const [recommendedTech, setRecommendedTech] = useState(null);
  const [initialClientAsk, setInitialClientAsk] = useState("");
  const [banglaClientSummary, setBanglaClientSummary] = useState("");
  const [banglaHistory, setBanglaHistory] = useState([]);
  const [bnLoading, setBnLoading] = useState(false);
  const [copiedIdx, setCopiedIdx] = useState(null);
  const [clientDraftEnglish, setClientDraftEnglish] = useState("");
  const [clientDraftLoading, setClientDraftLoading] = useState(false);
  const [inputRole, setInputRole] = useState("client"); // 'client' | 'me'
    // Removed stray historyExcerpt declaration accidentally placed among state declarations
  const [clarificationDone, setClarificationDone] = useState(false);
  const [techDone, setTechDone] = useState(false);
  const conversationRef = useRef(null);
  const explanationRef = useRef(null);

  const resetAll = () => {
    setMessages([]);
    setInput("");
    setStep(STEP.CLARIFICATION);
    setIsLoading(false);
    setError(null);
    setNextSignal(null);
    setRequirementSummary([]);
    setRecommendedTech(null);
    setInitialClientAsk("");
    setBanglaClientSummary("");
    setBanglaHistory([]);
    setClientDraftEnglish("");
    setClientDraftLoading(false);
    setClarificationDone(false);
    setTechDone(false);
    setInputRole("client");
    setPage('sales');
    setQuotationText("");
    setAutoQuoteRequested(false);
  };

  const detectClientTech = (text) => {
    if (!text) return false;
    const lower = text.toLowerCase();
    const keywords = [
      "laravel",
      "wordpress",
      "woocommerce",
      "woo",
      "wp",
      "elementor",
      "crocoblock",
      "next.js",
      "nextjs",
      "react",
      "react native",
      "rn",
      "angular",
      "vue",
      "nuxt",
      "svelte",
      "astro",
      "php",
      "node",
      "express",
      "nestjs",
      "django",
      "flask",
      "rails",
      "spring",
      "java",
      "kotlin",
      "swift",
      "flutter",
      "android",
      "ios",
      "shopify",
      "wix",
      "squarespace",
      "strapi",
      "ghost",
      "sanity",
      "contentful",
      "graphql",
      "apollo",
      "rest api",
      "prisma",
      "sequelize",
      "typeorm",
      "mongodb",
      "mongo",
      "mysql",
      "postgres",
      "postgresql",
      "firebase",
      "supabase",
      "aws",
      "azure",
      "gcp",
      "cloudflare",
      "tailwind",
      "bootstrap",
    ];
    return keywords.some((k) => lower.includes(k));
  };

  // Extract a readable technology label from user text
  const extractTechName = (text) => {
    if (!text) return null;
    const t = text.toLowerCase();
    // Prefer back-end frameworks when both FE and BE are mentioned (e.g., Laravel + React)
    const ordered = [
      { re: /laravel/, label: 'Laravel (PHP)' },
      { re: /django/, label: 'Django (Python)' },
      { re: /flask/, label: 'Flask (Python)' },
      { re: /rails/, label: 'Ruby on Rails' },
      { re: /spring|java/, label: 'Spring (Java)' },
      { re: /node|express|nestjs/, label: 'Node.js (Express/NestJS)' },
      // Then CMS/ecommerce
      { re: /woocommerce|\bwoo\b/, label: 'WordPress + WooCommerce' },
      { re: /wordpress|\bwp\b/, label: 'WordPress' },
      { re: /shopify/, label: 'Shopify' },
      // Then front-end frameworks
      { re: /next\.js|nextjs/, label: 'Next.js' },
      { re: /vue|nuxt/, label: 'Vue.js/Nuxt' },
      { re: /react native|\brn\b/, label: 'React Native' },
      { re: /react(?! native)/, label: 'React' },
      { re: /svelte|astro/, label: 'Svelte/Astro' },
      // Platforms / services
      { re: /graphql|apollo/, label: 'GraphQL/Apollo' },
      { re: /firebase|supabase/, label: 'Firebase/Supabase' },
    ];
    const found = ordered.find(m => m.re.test(t));
    return found ? found.label : null;
  };

  const callAI = async (userText) => {
    setIsLoading(true);
    setError(null);

  // Sanitize & simplify quotation output: remove markdown tables, collapse spacing, enforce plain bullets.
  const sanitizeQuotation = (raw) => {
    if (!raw) return "";
    let text = raw.replace(/\r/g, "");
    // Drop markdown table sections (| ... | lines)
    const lines = text.split(/\n/);
    const cleanedLines = [];
    let inTable = false;
    for (const line of lines) {
      const isTableRow = /^\s*\|.*\|\s*$/.test(line);
      if (isTableRow) {
        inTable = true;
        continue; // skip table rows entirely
      } else if (inTable && line.trim() === "") {
        inTable = false;
        continue;
      }
      if (!inTable) cleanedLines.push(line);
    }
    text = cleanedLines.join("\n");
    // Replace multiple blank lines with single
    text = text.replace(/\n{3,}/g, "\n\n");
    // Normalize section headings (remove excessive asterisks)
    text = text.replace(/\*{2,}([^*]+)\*{2,}/g, (m, p1) => p1.trim().toUpperCase());
    // Convert bullet styles to single hyphen
    text = text.replace(/^\s*\*\s+/gm, "- ");
    // Trim trailing spaces
    text = text.replace(/[ \t]+$/gm, "");
    return text.trim();
  };
    try {
      const response = await fetch("http://localhost:3001/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: userText }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "API call failed");

  let aiText = data.output || "";
    // Extract NEXT header (search anywhere, not just first line)
    const match = aiText.match(/(^|\n)\s*NEXT:\s*(clarification_needed|proceed_tech|proceed_quote|out_of_scope)/i);
    const signal = match ? match[2].toLowerCase() : null;
      // Gate the signal so quotation cannot proceed before clarification and technology are done
      let effectiveSignal = signal;
      if (signal === 'proceed_quote') {
        if (!clarificationDone) effectiveSignal = 'clarification_needed';
        else if (!techDone) effectiveSignal = 'proceed_tech';
      }
  setNextSignal(effectiveSignal);

      // Parse Requirement Summary bullets if present
      const summary = [];
      const lines = aiText.split(/\r?\n/);
      const summaryStart = lines.findIndex((l) => /Requirement Summary/i.test(l));
      if (summaryStart !== -1) {
        for (let i = summaryStart + 1; i < lines.length; i++) {
          const l = lines[i];
            if (/^\s*-\s+.+/.test(l)) {
              summary.push(l.replace(/^\s*-\s+/, "").trim());
            } else if (l.trim() === "") {
              // allow blank lines inside summary; continue
              continue;
            } else if (summary.length > 0) {
              // End summary block when bullets ended
              break;
            }
        }
      }
      if (summary.length) setRequirementSummary(summary);

      // Detect Tech Stack Summary line if coming from proceed_quote or proceed_tech step
      if (effectiveSignal === "proceed_quote" || effectiveSignal === "proceed_tech") {
        const techLineIdx = lines.findIndex((l) => /Tech Stack Summary/i.test(l));
        if (techLineIdx !== -1) {
          // The next non-empty line after the header is summary content
          for (let i = techLineIdx + 1; i < lines.length; i++) {
            const t = lines[i].trim();
            if (t) { setRecommendedTech(t); break; }
          }
        }
      }

      if (effectiveSignal === "proceed_quote") {
        aiText = sanitizeQuotation(aiText);
      }
      // Hide any NEXT control line from the visible message
      const visibleText = aiText
        .split(/\r?\n/)
        .filter(l => !/^\s*NEXT:/i.test(l))
        .join("\n")
        .trim();
      setMessages((prev) => [...prev, { role: "ai", text: visibleText }]);
      // In Clarification, do not auto-advance tabs; only update completion flags
      if (step === STEP.CLARIFICATION) {
        if (effectiveSignal === "proceed_tech") {
          setClarificationDone(true);
        }
        if (effectiveSignal === "proceed_quote" || effectiveSignal === "out_of_scope") {
          setClarificationDone(true);
          setTechDone(true);
        }
      } else {
        advanceStep(effectiveSignal);
        if (effectiveSignal === "proceed_tech") {
          setClarificationDone(true);
        }
        if (effectiveSignal === "proceed_quote" || effectiveSignal === "out_of_scope") {
          setClarificationDone(true);
          setTechDone(true);
        }
      }
  return { aiText: visibleText, signal: effectiveSignal };
    } catch (e) {
      console.error(e);
      setError(e.message);
    } finally {
      setIsLoading(false);
      setInput("");
    }
  };

  const advanceStep = (signal) => {
    if (!signal) return; // stay until proper signal
    // While still in Clarification we do NOT auto-transition on proceed_tech/proceed_quote; user controls with 'next'
    if (step === STEP.CLARIFICATION) {
      if (signal === "clarification_needed") {
        setStep(STEP.CLARIFICATION);
      }
      // For other signals we only set flags elsewhere; no step change here.
      return;
    }
    if (signal === "clarification_needed") {
      setStep(STEP.CLARIFICATION);
    } else if (signal === "proceed_tech") {
      setStep(STEP.TECH);
    } else if (signal === "proceed_quote" || signal === "out_of_scope") {
      setStep(STEP.QUOTE);
    }
  };

  const handleSubmit = async () => {
    const value = input.trim();
    if (!value) return;
    if (inputRole === "client") {
      // Capture initial client ask once
      if (step === STEP.CLARIFICATION && !initialClientAsk) {
        setInitialClientAsk(value);
      }
      setMessages((prev) => [...prev, { role: "user", author: 'client', text: value }]);
      // Sales-side Bangla explanation
      explainForSales(value);
      // Build prompt for merged flow
      const techSpecifiedNow = extractTechName(value) || extractTechName(initialClientAsk);
      let prompt = buildPromptForStep(value) + "\n\nPlease reply in English.";
      if (techSpecifiedNow) {
        setTechDone(true);
        setRecommendedTech(`Client-specified: ${techSpecifiedNow}`);
      }
      const result = await callAI(prompt);
      if (result && result.signal === "clarification_needed") {
        draftClarificationForClient(result.aiText, value);
      } else {
        setClientDraftEnglish("");
      }
    } else {
      // Internal question from sales
      setMessages((prev) => [...prev, { role: "user", author: 'me', text: value }]);
      await askInternal(value);
    }
    setInput("");
  };

  const handleKeyDown = (e) => {
    // merged flow: Enter just submits (handled by button or manually)
  };

  const askInternal = async (question) => {
    try {
      const historyExcerpt = messages
        .slice(-6)
        .map((m) => `${m.role === "user" ? "User" : "AI"}: ${m.text}`)
        .join("\n---\n");
      const wantsEnglish = /english/i.test(question);
      const langInstr = wantsEnglish
        ? "Reply ONLY in English to the following internal sales question. Keep it short (2-6 lines)."
        : "Reply ONLY in Bangla (বাংলা) to the following internal sales question. Keep it short (2-6 lines).";
      const prompt = `${langInstr} Do NOT include NEXT header.\n\nConversation (truncated):\n${historyExcerpt}\n\nQuestion:\n${question}`;
      const response = await fetch("http://localhost:3001/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt }),
      });
      const data = await response.json();
      let text = data?.output || "";
      const lines = text.split(/\r?\n/);
      if (/^NEXT:/i.test(lines[0] || "")) {
        let start = 1;
        while (start < lines.length && lines[start].trim() === "") start++;
        text = lines.slice(start).join("\n");
      }
      setMessages((prev) => [...prev, { role: "ai", text: text.trim() }]);
    } catch (e) {
      setMessages((prev) => [...prev, { role: "ai", text: "(বাংলা জবাব দেয়া যায়নি — পরে আবার চেষ্টা করুন)" }]);
    }
  };

  // Create an automatic Bangla explanation for sales clarity (not a raw translation)
  const explainForSales = async (userText) => {
    const source = userText || initialClientAsk || messages.find((m) => m.role === "user")?.text || "";
    if (!source.trim()) return;
    setBnLoading(true);
    try {
      const prompt = `For a non-technical sales person, explain in Bangla (বাংলা) what the client is asking and what they want.\nKeep it short and clear: 2-5 bullet points.\nAvoid templates and headings. Do NOT include NEXT header.\n\nClient message:\n${source}`;
      const res = await fetch("http://localhost:3001/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt }),
      });
      const data = await res.json();
      let text = (data && data.output) || "";
      // Strip control header if present
      const lines = text.split(/\r?\n/);
      if (/^NEXT:/i.test(lines[0] || "")) {
        let start = 1;
        while (start < lines.length && lines[start].trim() === "") start++;
        text = lines.slice(start).join("\n");
      }
  const cleaned = text.trim();
  setBanglaClientSummary(cleaned);
  setBanglaHistory((prev) => [...prev, cleaned]);
    } catch (e) {
      setBanglaClientSummary("(বাংলায় ব্যাখ্যা তৈরি করা যায়নি। পরে আবার চেষ্টা করুন.)");
    } finally {
      setBnLoading(false);
    }
  };

  // Draft a short English message for the client asking minimal clarifications
  const draftClarificationForClient = async (aiText, clientMsg) => {
    setClientDraftLoading(true);
    try {
      const prompt = `Draft a short, professional English message we can send to the client to request only the necessary clarifications.\n- Keep it polite and concise.\n- Start with one sentence acknowledging their request.\n- Then provide 3-6 numbered clarification points derived from the notes below.\n- End with a friendly closing line.\n- Do NOT include NEXT header.\n\nContext (AI analysis):\n${aiText}\n\nClient message:\n${clientMsg}`;
      const res = await fetch("http://localhost:3001/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt }),
      });
      const data = await res.json();
      let text = data?.output || "";
      const lines = text.split(/\r?\n/);
      if (/^NEXT:/i.test(lines[0] || "")) {
        let start = 1;
        while (start < lines.length && lines[start].trim() === "") start++;
        text = lines.slice(start).join("\n");
      }
  setClientDraftEnglish(text.trim());
    } catch (e) {
      setClientDraftEnglish("(Could not draft the client message. Please try again.)");
    } finally {
      setClientDraftLoading(false);
    }
  };

  const copyText = async (txt, idx) => {
    try {
      await navigator.clipboard.writeText(txt);
      setCopiedIdx(idx);
      setTimeout(() => setCopiedIdx(null), 1200);
    } catch (e) {
      // ignore
    }
  };

  // Build contextual prompt to keep conversation minimal but stateful.
  const buildPromptForStep = (latestUser) => {
    const historyExcerpt = messages
      .slice(-6)
      .map((m) => `${m.role === 'user' ? (m.author === 'me' ? 'Sales Person' : 'Client') : 'AI'}: ${m.text}`)
      .join("\n---\n");
    const instruction = `Merged Flow: Clarification → Technology → Quotation.
1) If the request is incomplete or lacks essential details, ask ONLY the minimal clarifying questions (concise).
   - If they only mention a site/business type (ecommerce, portfolio, blog, company, landing, news etc.), propose a minimal feature set for that type (e.g. ecommerce: product listing, product detail, cart, checkout, order management, basic payment integration) and ask if they need more.
2) If the client states a technology, acknowledge it. If not, suggest a sensible default (e.g. WordPress for common site types) with a one-sentence rationale.
3) Only when clarification is complete AND technology is decided, produce the quotation including:
   - Requirement Summary (bullets)
   - Tech Stack Summary
   - Limitations & Paid/External APIs
   - Quotation section (pricing / timeline)
4) Provide exactly one control line at the very end (not part of the visible explanation body): NEXT: clarification_needed | proceed_tech | proceed_quote | out_of_scope
Do not expose or explain the NEXT line in the user-facing content.`;
    return `${instruction}\n\nRecent History (truncated):\n${historyExcerpt}\n\nLatest User Input:\n${latestUser}`;
  };

  // Auto suggest technology when clarification becomes done but tech not yet chosen
  useEffect(() => {
    if (page !== 'sales') return;
    if (clarificationDone && !techDone) {
      const lastUser = [...messages].reverse().find(m=>m.role==='user')?.text || '';
      const named = extractTechName(lastUser) || extractTechName(initialClientAsk);
      if (named) {
        setRecommendedTech(`Client-specified: ${named}`);
        setTechDone(true);
        return;
      }
      if (!recommendedTech) {
        const lower = lastUser.toLowerCase();
        if (/shopify/.test(lower)) {
          setRecommendedTech('Suggested Technology: Shopify (hosted ecommerce with robust ecosystem)');
        } else if (/e-?commerce|shop|store|catalog/.test(lower)) {
          setRecommendedTech('Suggested Technology: WordPress + WooCommerce (fast delivery, rich plugin ecosystem)');
        } else if (/android|ios|mobile app|mobile\b|flutter/.test(lower)) {
          setRecommendedTech('Suggested Technology: Flutter (cross-platform mobile app with single codebase)');
        } else if (/react native|expo/.test(lower)) {
          setRecommendedTech('Suggested Technology: React Native (cross-platform mobile app)');
        } else if (/dashboard|admin|portal|saas|web app/.test(lower)) {
          setRecommendedTech('Suggested Technology: Next.js (React SSR/ISR for performant web app)');
        } else if (/blog|portfolio|company|landing|news/.test(lower)) {
          setRecommendedTech('Suggested Technology: WordPress (CMS-friendly, quick to launch)');
        } else if (/api|backend/.test(lower)) {
          setRecommendedTech('Suggested Technology: Node.js (Express/NestJS) for REST API backend');
        } else {
          setRecommendedTech('Suggested Technology: WordPress (versatile default choice)');
        }
      }
      setTechDone(true);
    }
  }, [clarificationDone, techDone, recommendedTech, messages, page, initialClientAsk]);

  // Auto quotation generation once clarification & tech are done
  useEffect(() => {
    const ready = page==='sales' && clarificationDone && techDone && !quotationText && !autoQuoteRequested;
    if (ready) {
      setAutoQuoteRequested(true);
      const prompt = `Generate final quotation now.
Include: Requirement Summary, Tech Stack Summary, Limitations (with paid/external API needs), Quotation pricing section.
Plain text only. NEXT: proceed_quote.`;
      callAI(prompt).then(res => {
        if (res?.aiText) setQuotationText(res.aiText);
      });
    }
  }, [clarificationDone, techDone, quotationText, autoQuoteRequested, page]);

  const flowStatusMessage = () => {
    const techLabel = (recommendedTech || '').replace(/^Suggested Technology:\s*/i,'').replace(/^Client-specified:\s*/i,'').trim();
    if (!clarificationDone && !techDone) return 'Need clarification, technology selection and quotation.';
    if (!clarificationDone && techDone) return `Technology selected${techLabel?` (${techLabel})`:''}. Need clarification and quotation.`;
    if (clarificationDone && !techDone) return 'Clarification complete. Selecting suitable technology...';
    if (clarificationDone && techDone && !quotationText) return `Clarification & technology confirmed${techLabel?` (${techLabel})`:''}. Generating quotation...`;
    if (clarificationDone && techDone && quotationText) return `All stages complete${techLabel?` (${techLabel})`:''}. Quotation ready.`;
    return '';
  };

  // Removed old tab UI helpers (renderTabButton, tabs) since flow is merged and controlled by flags

  useEffect(() => {
    if (conversationRef.current) conversationRef.current.scrollTop = conversationRef.current.scrollHeight;
  }, [messages]);
  useEffect(() => {
    if (explanationRef.current) explanationRef.current.scrollTop = explanationRef.current.scrollHeight;
  }, [banglaHistory]);

  const renderStatusIcon = (done, current) => {
    if (done) return <span className="text-green-400 ml-1">✓</span>;
    if (current) return <span className="text-yellow-400 ml-1">•</span>;
    return <span className="text-red-500 ml-1">✗</span>;
  };

  const currentMessages = messages.filter((m) => true); // future: segment per step if needed
  return (
    <div className="w-screen h-screen overflow-hidden flex bg-[#0f1115] text-gray-200 font-[Inter]">
      {/* Left Sidebar Navigation */}
      <aside className="w-60 h-full flex flex-col border-r border-gray-800 bg-[#12151c] p-5">
        <h1 className="text-lg font-semibold tracking-wide text-gray-100 mb-6">AI Sales Assistant</h1>
        <nav className="space-y-3 text-sm">
          <button onClick={()=>setPage('sales')} className={`w-full text-left px-3 py-2 rounded-md border transition ${page==='sales' ? 'border-green-500/70 bg-green-500/10 text-green-300' : 'border-gray-700 bg-[#181c23] text-gray-400 hover:text-gray-300'}`}>Sales Flow</button>
          <button onClick={()=>setPage('fiverr')} className={`w-full text-left px-3 py-2 rounded-md border transition ${page==='fiverr' ? 'border-green-500/70 bg-green-500/10 text-green-300' : 'border-gray-700 bg-[#181c23] text-gray-400 hover:text-gray-300'}`}>Fiverr Cleaner</button>
        </nav>
        {/* Left sidebar status removed to avoid duplication with right-side Flow Status */}
        <button onClick={resetAll} className="mt-auto text-xs bg-red-600/80 hover:bg-red-600 text-white px-3 py-1.5 rounded shadow-sm">Reset</button>
      </aside>

      {/* Main Workspace */}
      <main className="flex-1 h-full overflow-hidden p-8 grid content-start gap-6">
        {page === 'sales' && (
          <>
        {/* Step 2/3 top context (kept compact to avoid page scroll) */}
        {step !== STEP.CLARIFICATION && (
          <div className="grid grid-cols-1 gap-4">
            {requirementSummary.length > 0 && (
              <section className="bg-[#161b22] border border-gray-800 rounded-xl p-4 shadow-sm max-h-32 overflow-auto">
                <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-300 mb-2">Requirement Summary</h2>
                <ul className="space-y-1 text-[13px] text-gray-400">
                  {requirementSummary.map((r, i) => (
                    <li key={i} className="flex gap-2"><span className="text-green-500">•</span><span>{r}</span></li>
                  ))}
                </ul>
              </section>
            )}
            {recommendedTech && (
              <section className="bg-[#161b22] border border-gray-800 rounded-xl p-4 shadow-sm">
                <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-300 mb-2">Recommended Technology</h2>
                <p className="text-[13px] text-gray-400 leading-relaxed">{recommendedTech}</p>
              </section>
            )}
          </div>
        )}

        {/* Step 1: two-column layout (Conversation left, Client ask right) */}
        {page==='sales' && step === STEP.CLARIFICATION && (
          <div className="grid grid-cols-2 gap-6">
            <section className="bg-[#161b22] border border-gray-800 rounded-xl p-6 shadow-sm h-[50vh] overflow-hidden flex flex-col">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-300 mb-4">Conversation</h2>
              <div ref={conversationRef} className="space-y-4 overflow-y-auto pr-2">
                {currentMessages.length === 0 && (
                  <p className="text-xs text-gray-500">কোনো মেসেজ নেই। নতুন মেসেজ লিখে Submit করুন।</p>
                )}
                {currentMessages.map((m, idx) => (
                  <div
                    key={idx}
                    className={`rounded-lg px-4 py-3 text-sm leading-relaxed border backdrop-blur-sm ${
                      m.role === "user"
                        ? "bg-gradient-to-r from-green-500/10 to-emerald-500/5 border-green-700/30"
                        : "bg-[#1d232c] border-gray-700/50"
                    }`}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-[11px] font-medium tracking-wider uppercase text-gray-400">
                        {m.role === "user" ? (m.author === 'me' ? 'Sales Person' : 'Client') : 'AI'}
                      </span>
                      <div className="flex items-center gap-2">
                        {step === STEP.CLARIFICATION && m.role === "ai" && (
                          <button
                            onClick={() => copyText(m.text, idx)}
                            className="text-[10px] px-1.5 py-0.5 rounded bg-gray-700/40 text-gray-300 hover:bg-gray-600/50 border border-gray-600/40"
                            title="Copy message"
                          >
                            {copiedIdx === idx ? "Copied" : "Copy"}
                          </button>
                        )}
                        {idx === currentMessages.length - 1 && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-700/40 text-gray-400">Latest</span>
                        )}
                      </div>
                    </div>
                    <div className="whitespace-pre-wrap text-gray-300">{m.text}</div>
                  </div>
                ))}
              </div>
            </section>

            <section className="bg-[#161b22] border border-gray-800 rounded-xl p-6 shadow-sm h-[50vh] overflow-hidden flex flex-col">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-300">বিক্রয় দলের জন্য সহজ ব্যাখ্যা (বাংলায়)</h2>
                {bnLoading && <span className="text-[10px] px-2 py-1 rounded bg-gray-700/50 text-gray-300 border border-gray-600/40">Loading…</span>}
              </div>
              <div ref={explanationRef} className="space-y-3 overflow-y-auto pr-2 text-sm">
                {banglaHistory.length === 0 && (
                  <p className="text-xs text-gray-500">(এখনো কোনো ব্যাখ্যা নেই)</p>
                )}
                {banglaHistory.map((ex, idx) => (
                  <div key={idx} className="border border-gray-700/60 rounded-lg p-3 bg-[#1d232c] whitespace-pre-wrap leading-relaxed">
                    <div className="text-[10px] uppercase tracking-wider text-gray-500 mb-1">Explanation {idx + 1}</div>
                    <div className="text-gray-300">{ex}</div>
                  </div>
                ))}
              </div>
              {clientDraftEnglish && (
                <div className="mt-3 pt-3 border-t border-gray-800">
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="text-xs uppercase tracking-wide text-gray-300">Client message draft (English)</h3>
                    <button
                      onClick={() => copyText(clientDraftEnglish, -999)}
                      className="text-[10px] px-1.5 py-0.5 rounded bg-gray-700/40 text-gray-300 hover:bg-gray-600/50 border border-gray-600/40"
                    >
                      Copy
                    </button>
                  </div>
                  <div className="text-xs text-gray-300 whitespace-pre-wrap leading-relaxed">
                    {clientDraftLoading ? "Preparing…" : clientDraftEnglish}
                  </div>
                </div>
              )}
            </section>
          </div>
        )}

        {/* Steps 2 & 3: Conversation single column */}
        {page==='sales' && step !== STEP.CLARIFICATION && (
          <div className="grid grid-cols-2 gap-6">
            <section className="bg-[#161b22] border border-gray-800 rounded-xl p-6 shadow-sm h-[10vh] overflow-hidden flex flex-col">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-300 mb-4">Conversation</h2>
              <div ref={conversationRef} className="space-y-4 overflow-y-auto pr-2">
                {currentMessages.length === 0 && (
                  <p className="text-xs text-gray-500">কোনো মেসেজ নেই। নতুন মেসেজ লিখে Submit করুন।</p>
                )}
                {currentMessages.map((m, idx) => (
                  <div
                    key={idx}
                    className={`rounded-lg px-4 py-3 text-sm leading-relaxed border backdrop-blur-sm ${
                      m.role === "user"
                        ? "bg-gradient-to-r from-green-500/10 to-emerald-500/5 border-green-700/30"
                        : "bg-[#1d232c] border-gray-700/50"
                    }`}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-[11px] font-medium tracking-wider uppercase text-gray-400">
                        {m.role === "user" ? (m.author === 'me' ? 'Sales Person' : 'Client') : 'AI'}
                      </span>
                      <div className="flex items-center gap-2">
                        {m.role === "ai" && (
                          <button
                            onClick={() => copyText(m.text, idx)}
                            className="text-[10px] px-1.5 py-0.5 rounded bg-gray-700/40 text-gray-300 hover:bg-gray-600/50 border border-gray-600/40"
                            title="Copy message"
                          >
                            {copiedIdx === idx ? "Copied" : "Copy"}
                          </button>
                        )}
                        {idx === currentMessages.length - 1 && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-700/40 text-gray-400">Latest</span>
                        )}
                      </div>
                    </div>
                    <div className="whitespace-pre-wrap text-gray-300">{m.text}</div>
                  </div>
                ))}
              </div>
            </section>
            <section className="bg-[#161b22] border border-gray-800 rounded-xl p-6 shadow-sm h-[10vh] overflow-hidden flex flex-col">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-300">বিক্রয় দলের জন্য সহজ ব্যাখ্যা (বাংলায়)</h2>
                {bnLoading && <span className="text-[10px] px-2 py-1 rounded bg-gray-700/50 text-gray-300 border border-gray-600/40">Loading…</span>}
              </div>
              <div ref={explanationRef} className="space-y-3 overflow-y-auto pr-2 text-sm">
                {banglaHistory.length === 0 && (
                  <p className="text-xs text-gray-500">(এখনো কোনো ব্যাখ্যা নেই)</p>
                )}
                {banglaHistory.map((ex, idx) => (
                  <div key={idx} className="border border-gray-700/60 rounded-lg p-3 bg-[#1d232c] whitespace-pre-wrap leading-relaxed">
                    <div className="text-[10px] uppercase tracking-wider text-gray-500 mb-1">Explanation {idx + 1}</div>
                    <div className="text-gray-300">{ex}</div>
                  </div>
                ))}
              </div>
              {clientDraftEnglish && (
                <div className="mt-4 pt-4 border-t border-gray-800">
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="text-xs uppercase tracking-wide text-gray-300">Client message draft (English)</h3>
                    <button
                      onClick={() => copyText(clientDraftEnglish, -999)}
                      className="text-[10px] px-1.5 py-0.5 rounded bg-gray-700/40 text-gray-300 hover:bg-gray-600/50 border border-gray-600/40"
                    >
                      Copy
                    </button>
                  </div>
                  <div className="text-xs text-gray-300 whitespace-pre-wrap leading-relaxed">
                    {clientDraftLoading ? "Preparing…" : clientDraftEnglish}
                  </div>
                </div>
              )}
            </section>
          </div>
        )}

        {/* Input row spans full width */}
        {page==='sales' && (
          <section className="bg-[#161b22] border border-gray-800 rounded-xl p-6 shadow-sm">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-300 mb-4">Input</h2>
            <div className="grid grid-cols-2 gap-6 items-stretch">
              {/* Left: input card */}
              <div className="rounded-lg border border-gray-700/70 bg-[#1d232c] p-3 flex flex-col h-[30vh]">
                <h3 className="text-sm font-semibold uppercase tracking-wide text-gray-300 mb-2">Message</h3>
                <div className="flex items-center gap-3 text-xs mb-2">
                  <label className="text-gray-400">Sender:</label>
                  <select
                    value={inputRole}
                    onChange={(e) => setInputRole(e.target.value)}
                    className="bg-[#141922] border border-gray-700/70 text-gray-200 rounded px-2 py-1 focus:outline-none focus:ring-2 focus:ring-green-600/40"
                  >
                    <option value="client">client</option>
                    <option value="me">me</option>
                  </select>
                </div>
                <textarea
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  className="w-full resize-none rounded-lg bg-[#141922] border border-gray-700/70 focus:border-green-500/70 focus:ring-2 focus:ring-green-600/40 outline-none text-sm p-3 placeholder:text-gray-600 text-gray-200 tracking-wide leading-relaxed flex-1"
                  placeholder={
                    inputRole === "client"
                      ? "ক্লায়েন্টের মেসেজ / প্রয়োজন লিখুন..."
                      : "আপনার (sales) প্রশ্ন লিখুন — এটি বাংলায় জবাব দেবে"
                  }
                />
                <div className="flex items-center gap-4 mt-3">
                  <button
                    onClick={handleSubmit}
                    disabled={isLoading || !input.trim()}
                    className={`px-6 py-2.5 rounded-lg text-sm font-medium tracking-wide transition shadow-sm ${
                      isLoading
                        ? "bg-gray-700 text-gray-400 cursor-not-allowed"
                        : "bg-green-600 hover:bg-green-500 text-white"
                    }`}
                  >
                    {isLoading ? "Processing..." : "Submit"}
                  </button>
                  {error && (
                    <span className="text-[12px] text-red-400 font-medium">{error}</span>
                  )}
                </div>
                <p className="text-[11px] text-gray-500 leading-relaxed mt-2">Tip: স্পষ্ট ফিচার / পেজ / লক্ষ্য উল্লেখ করুন।</p>
              </div>
              {/* Right: flow status card */}
              <div className="rounded-lg border border-gray-700/70 bg-[#1d232c] p-3 flex flex-col h-[30vh]">
                <h3 className="text-sm font-semibold uppercase tracking-wide text-gray-300 mb-2">Flow Status</h3>
                <div className="text-sm space-y-2 flex-1">
                  <div className="flex items-center justify-between">
                    <span className="text-gray-400">Clarification</span>
                    <span className={`text-[11px] px-2 py-0.5 rounded ${clarificationDone? 'bg-green-600/20 text-green-300 border border-green-600/40':'bg-gray-700/40 text-gray-400 border border-gray-600/40'}`}>{clarificationDone? '✓':'✗'}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-gray-400">Technology</span>
                    <span className={`text-[11px] px-2 py-0.5 rounded ${techDone? 'bg-green-600/20 text-green-300 border border-green-600/40':'bg-gray-700/40 text-gray-400 border border-gray-600/40'}`}>{techDone? '✓':'✗'}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-gray-400">Quotation</span>
                    <span className={`text-[11px] px-2 py-0.5 rounded ${quotationText? 'bg-green-600/20 text-green-300 border border-green-600/40':'bg-gray-700/40 text-gray-400 border border-gray-600/40'}`}>{quotationText? '✓':'✗'}</span>
                  </div>
                  <div className="text-xs text-gray-300 mt-2 whitespace-pre-wrap">{flowStatusMessage()}</div>
                  {quotationText && (
                    <button onClick={()=>copyText(quotationText,-100)} className="mt-2 text-[11px] px-2 py-1 rounded bg-gray-700/60 hover:bg-gray-600 border border-gray-600/50">Copy Quotation</button>
                  )}
                </div>
                {recommendedTech && (
                  <div className="text-[11px] text-gray-400 whitespace-pre-wrap rounded-lg p-2 bg-[#141922] border border-gray-700/60">{recommendedTech}</div>
                )}
              </div>
            </div>
          </section>
        )}
          </>
        )}

        {page==='fiverr' && (
          <FiverrCleaner />
        )}
      </main>
    </div>
  );
}

export default App;

// Fiverr Cleaner Component (inline for simplicity)
function FiverrCleaner() {
  const [raw, setRaw] = useState('');
  const [cleaned, setCleaned] = useState('');
  const [copied, setCopied] = useState(false);
  const bannedPatterns = [
    { r: /\bpaid\b/gi, rep: 'pa-id' },
    { r: /\bpayment(s)?\b/gi, rep: 'pay-ment$1' },
    { r: /\bmoney\b/gi, rep: 'mo-ney' },
    { r: /\bemail\b/gi, rep: 'em-ail' },
    { r: /\bgmail\b/gi, rep: 'gm-ail' },
    { r: /\bmail\b/gi, rep: 'ma-il' },
    { r: /\bphone\b/gi, rep: 'ph-one' },
    { r: /\bwhatsapp\b/gi, rep: 'what-sapp' },
    { r: /\bcontact\b/gi, rep: 'con-tact' },
    { r: /\bskype\b/gi, rep: 'sky-pe' },
    { r: /\bzoom\b/gi, rep: 'zo-om' },
    { r: /\bdollar(s)?\b/gi, rep: 'dol-lar$1' },
    { r: /\bapi(s)?\b/gi, rep: 'a-pi$1' },
    { r: /\bpay\b/gi, rep: 'pa-y' },
    { r: /\bpricing\b/gi, rep: 'pri-cing' },
  ];
  const process = () => {
    let txt = raw;
    bannedPatterns.forEach(({r, rep}) => { txt = txt.replace(r, rep); });
    setCleaned(txt);
  };
  const copyOut = async () => {
    try { await navigator.clipboard.writeText(cleaned); setCopied(true); setTimeout(()=>setCopied(false), 1200);} catch(e){}
  };
  return (
    <div className="grid grid-cols-2 gap-6">
      <section className="bg-[#161b22] border border-gray-800 rounded-xl p-6 shadow-sm flex flex-col h-[60vh]">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-300 mb-4">Input (Raw Fiverr Message)</h2>
        <textarea value={raw} onChange={e=>setRaw(e.target.value)} className="flex-1 resize-none rounded-lg bg-[#1d232c] border border-gray-700/70 focus:border-green-500/70 focus:ring-2 focus:ring-green-600/40 outline-none text-sm p-3 placeholder:text-gray-600 text-gray-200" placeholder="Paste client or draft message here..." />
        <div className="mt-4 flex items-center gap-3">
          <button onClick={process} disabled={!raw.trim()} className={`px-5 py-2 rounded-lg text-sm font-medium ${raw.trim()? 'bg-green-600 hover:bg-green-500 text-white':'bg-gray-700 text-gray-400 cursor-not-allowed'}`}>Clean & Obfuscate</button>
          <button onClick={()=>{setRaw(''); setCleaned('');}} className="px-4 py-2 rounded-lg text-sm bg-gray-700/60 hover:bg-gray-600 text-gray-200">Clear</button>
        </div>
        <p className="text-[11px] text-gray-500 leading-relaxed mt-3">Replaces sensitive / disallowed words (paid, money, email, phone, etc.) with obfuscated forms to reduce Fiverr TOS triggers while keeping meaning.</p>
      </section>
      <section className="bg-[#161b22] border border-gray-800 rounded-xl p-6 shadow-sm flex flex-col h-[60vh]">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-300">Output (Safe Version)</h2>
          {cleaned && <button onClick={copyOut} className="text-[11px] px-2 py-1 rounded bg-gray-700/60 hover:bg-gray-600 border border-gray-600/40">{copied? 'Copied':'Copy'}</button>}
        </div>
        <div className="flex-1 overflow-auto rounded-lg bg-[#1d232c] border border-gray-700/70 p-3 text-sm whitespace-pre-wrap text-gray-300">{cleaned || <span className="text-gray-600">(No output yet)</span>}</div>
        {cleaned && <p className="mt-3 text-[11px] text-gray-500 leading-relaxed">You can copy and refine further before sending.</p>}
      </section>
    </div>
  );
}
