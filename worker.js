export default {
    async fetch(request, env) {
      if (request.method === "OPTIONS") {
        return new Response(null, { headers: corsHeaders() });
      }
      if (request.method !== "POST") {
        return json({ error: "Method not allowed" }, 405);
      }
  
      let body;
      try {
        body = await request.json();
      } catch (e) {
        return json({ error: "Invalid request body" }, 400);
      }
  
      const syllabusText = (body.syllabusText || "").trim();
      if (syllabusText.length < 30) {
        return json({ error: "Syllabus text is too short or missing." }, 400);
      }
  
      const prompt = `You are extracting assignments from a college syllabus. Read the syllabus text below and return ONLY a JSON array (no prose, no markdown code fences) of every graded assignment, exam, or deliverable with its due date. Each item must have exactly this shape:
  
  {"date": "YYYY-MM-DD", "class": "<short course name>", "title": "<assignment name>", "time": "<due time, or 'in class', or 'class time'>", "desc": "<one or two sentence description of what's required>"}
  
  Rules:
  - Only include actual graded deliverables (assignments, papers, exams, presentations, projects, quizzes). Skip weeks that only have readings with nothing due.
  - If a date is ambiguous, conflicting, or a typo in the syllabus, make your best guess for "date" and explain the ambiguity in "desc".
  - If no year is stated anywhere, assume 2026.
  - Sort the array chronologically by date.
  - Return ONLY the raw JSON array and nothing else, no explanation before or after it.
  
  Syllabus text:
  """
  ${syllabusText.slice(0, 20000)}
  """`;
  
      let resp;
      try {
        resp = await fetch("https://api.anthropic.com/v1/messages", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-api-key": env.ANTHROPIC_API_KEY,
            "anthropic-version": "2023-06-01"
          },
          body: JSON.stringify({
            model: "claude-sonnet-5",
            max_tokens: 4000,
            messages: [{ role: "user", content: prompt }]
          })
        });
      } catch (e) {
        return json({ error: "Could not reach Anthropic API", details: e.message }, 502);
      }
  
      const data = await resp.json();
      if (!resp.ok) {
        return json({ error: "AI request failed", details: data }, 502);
      }
  
      const text = (data.content || []).map(b => b.text || "").join("");
      const cleaned = text.replace(/```json/g, "").replace(/```/g, "").trim();
  
      let assignments;
      try {
        assignments = JSON.parse(cleaned);
      } catch (e) {
        return json({ error: "Could not parse AI response as JSON", raw: text }, 502);
      }
  
      if (!Array.isArray(assignments)) {
        return json({ error: "AI response was not a JSON array", raw: text }, 502);
      }
  
      return json({ assignments });
    }
  };
  
  function corsHeaders() {
    return {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type"
    };
  }
  
  function json(obj, status = 200) {
    return new Response(JSON.stringify(obj), {
      status,
      headers: { "Content-Type": "application/json", ...corsHeaders() }
    });
  }