import { useState } from "react";
import "./App.css"; // যদি থাকে

function App() {
  const [prompt, setPrompt] = useState("");
  const [output, setOutput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);

  const handleGenerate = async () => {
    if (!prompt.trim()) {
      alert("অনুগ্রহ করে কিছু লিখুন।");
      return;
    }

    setIsLoading(true);
    setOutput("");
    setError(null);

    try {
      // ব্যাকএন্ড সার্ভারে কল করা হচ্ছে
      const response = await fetch("http://localhost:3001/generate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ prompt }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "API call failed");
      }

      setOutput(data.output);
    } catch (err) {
      console.error("Frontend Error:", err);
      setError("An error occurred: " + err.message);
      setOutput("AI থেকে আউটপুট পেতে সমস্যা হয়েছে।");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div
      className="app-container"
      style={{ padding: "20px", maxWidth: "800px", margin: "0 auto" }}
    >
      <h1>🤖 Gemini Text Analyzer (React + Node.js)</h1>
      <p>টেকনোলজি রিকমেন্ডেশনের প্রশ্ন বা ক্লায়েন্টের রিকোয়ারমেন্ট লিখুন:</p>

      <textarea
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        placeholder="যেমন: 'ওয়ার্ডপ্রেস, লারাভেল এবং নেক্সটজেএস-এর মধ্যে একটি কাস্টম ই-কমার্স প্ল্যাটফর্মের জন্য কোনটি সেরা? কারণ ব্যাখ্যা করো।'"
        rows="8"
        style={{ width: "100%", padding: "10px", marginBottom: "15px" }}
      />

      <button
        onClick={handleGenerate}
        disabled={isLoading}
        style={{
          padding: "10px 20px",
          fontSize: "16px",
          cursor: "pointer",
          backgroundColor: isLoading ? "#ccc" : "#4CAF50",
          color: "white",
          border: "none",
          borderRadius: "5px",
        }}
      >
        {isLoading ? "জেনারেট হচ্ছে..." : "সাবমিট ও জেনারেট করুন"}
      </button>

      {error && (
        <p style={{ color: "red", marginTop: "15px" }}>Error: {error}</p>
      )}

      <div
        className="output-area"
        style={{
          marginTop: "30px",
          borderTop: "1px solid #eee",
          paddingTop: "15px",
        }}
      >
        <h2>জেনারেটেড আউটপুট:</h2>
        {output ? (
          <div
            style={{
              whiteSpace: "pre-wrap",
              backgroundColor: "#f9f9f9",
              padding: "15px",
              borderRadius: "5px",
              color: "#333",
            }}
          >
            {output}
          </div>
        ) : (
          !isLoading && <p>আউটপুট এখানে দেখাবে।</p>
        )}
      </div>
    </div>
  );
}

export default App;
