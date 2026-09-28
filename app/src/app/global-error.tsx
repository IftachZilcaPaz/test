"use client";

/** Last-resort fallback when the root layout itself fails; it renders its own document. */
export default function GlobalError({ error }: { error: Error & { digest?: string }; retry: () => void }) {
  console.error(error);
  return (
    <html lang="he" dir="rtl">
      <body
        style={{
          margin: 0,
          minHeight: "100dvh",
          display: "grid",
          placeItems: "center",
          padding: 16,
          background: "linear-gradient(160deg, #e6defb, #fce2ee)",
          color: "#2c2548",
          fontFamily: "system-ui, -apple-system, 'Segoe UI', Arial, sans-serif",
        }}
      >
        <title>משהו השתבש · reynovation</title>
        <main style={{ maxWidth: 360, padding: "32px 24px", borderRadius: 32, background: "#fffdff", textAlign: "center" }}>
          <h1 style={{ fontSize: "1.4rem", margin: "0 0 8px" }}>משהו השתבש</h1>
          <p style={{ color: "#655e83", lineHeight: 1.6, margin: "0 0 20px" }}>הפרויקטים והתשלומים שלכם שמורים. רעננו את הדף כדי להמשיך.</p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            style={{ border: 0, borderRadius: 999, padding: "12px 28px", font: "inherit", fontWeight: 600, color: "#fff", background: "linear-gradient(90deg, #f49bb7, #8b6fe8)", cursor: "pointer" }}
          >
            רענון הדף
          </button>
        </main>
      </body>
    </html>
  );
}
