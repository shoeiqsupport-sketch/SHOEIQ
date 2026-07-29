import { useState, useRef, useCallback, useEffect } from "react";

const ACCENT = "#C8F04A";
const DARK = "#0D0D0D";
const CARD = "#161616";
const MUTED = "#2A2A2A";
const TEXT = "#F0F0F0";
const SUBTEXT = "#888";
const ORANGE = "#F58426";
const API_KEY = process.env.REACT_APP_API_KEY;
const SNEAKERS_KEY = process.env.REACT_APP_SNEAKERS_KEY;

function parseJSON(text) {
  try {
    const clean = text.replace(/```json|```/g, "").trim();
    return JSON.parse(clean);
  } catch { return null; }
}

function buildStockXUrl(name, sku) {
  const q = sku || name;
  return `https://stockx.com/search?s=${encodeURIComponent(q)}`;
}
function buildGOATUrl(name, sku) {
  const q = sku || name;
  return `https://www.goat.com/search?query=${encodeURIComponent(q)}`;
}
function buildEbayUrl(name, sku) {
  const q = sku || name;
  return `https://www.ebay.com/sch/i.html?_nkw=${encodeURIComponent(q)}&_sacat=15709`;
}

function MarketBadge({ sentiment }) {
  const map = {
    hot:     { bg: "#ff4d0022", color: "#ff6633", dot: "🔥" },
    rising:  { bg: "#f5842622", color: "#F58426", dot: "📈" },
    stable:  { bg: "#00aaff22", color: "#44bbff", dot: "💧" },
    cooling: { bg: "#88888822", color: "#aaa",    dot: "❄️" },
  };
  const s = map[sentiment?.toLowerCase()] || map["stable"];
  return (
    <span style={{ display:"inline-flex", alignItems:"center", gap:5, borderRadius:99, padding:"5px 14px", fontSize:12, fontWeight:700, background:s.bg, color:s.color }}>
      {s.dot} {sentiment}
    </span>
  );
}

function WatchlistCard({ item, onRemove }) {
  return (
    <div style={{ background:CARD, borderRadius:16, padding:"14px 16px", display:"flex", alignItems:"center", gap:12 }}>
      {item.image && <img src={item.image} alt="" style={{ width:52, height:52, objectFit:"cover", borderRadius:10, flexShrink:0 }} />}
      <div style={{ flex:1, minWidth:0 }}>
        <div style={{ fontSize:11, color:ACCENT, letterSpacing:"2px", textTransform:"uppercase", marginBottom:2 }}>{item.brand}</div>
        <div style={{ fontSize:14, fontWeight:700, whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }}>{item.name}</div>
        <div style={{ fontSize:12, color:SUBTEXT, marginTop:2 }}>
          New <span style={{ color:ACCENT }}>${item.new_price_avg}</span> · Used <span style={{ color:"#ddd" }}>${item.used_price_avg}</span>
        </div>
      </div>
      <button onClick={() => onRemove(item.id)} style={{ background:"none", border:"none", color:"#555", fontSize:18, cursor:"pointer", padding:4 }}>✕</button>
    </div>
  );
}

export default function App() {
  const [tab, setTab] = useState("scan");
  const [image, setImage] = useState(null);
  const [imageBase64, setImageBase64] = useState(null);
  const [hover, setHover] = useState(false);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [watchlist, setWatchlist] = useState([]);
  const [savedToast, setSavedToast] = useState(false);
  const [calcPrice, setCalcPrice] = useState("");
  const [calcSize, setCalcSize] = useState("");
  const [calcCondition, setCalcCondition] = useState("new");
  const [calcResult, setCalcResult] = useState(null);
  const [drops, setDrops] = useState([]);
  const [dropsLoading, setDropsLoading] = useState(false);
  const [accuracyRating, setAccuracyRating] = useState(null);
  const [suggestion, setSuggestion] = useState("");
  const [suggestionSent, setSuggestionSent] = useState(false);
  const inputRef = useRef();

  const fetchDrops = useCallback(async () => {
    setDropsLoading(true);
    try {
      const rss = await fetch("https://api.rss2json.com/v1/api.json?rss_url=https://www.kicksonfire.com/feed/");
      const data = await rss.json();
      const items = (data.items || [])
        .filter(item =>
          item.title.toLowerCase().includes("release") ||
          item.title.toLowerCase().includes("drop") ||
          item.title.toLowerCase().includes("retro") ||
          item.title.toLowerCase().includes("jordan") ||
          item.title.toLowerCase().includes("dunk") ||
          item.title.toLowerCase().includes("yeezy") ||
          item.title.toLowerCase().includes("nike") ||
          item.title.toLowerCase().includes("adidas")
        )
        .slice(0, 10)
        .map(item => ({
          name: item.title,
          releaseDate: new Date(item.pubDate).toLocaleDateString("en-US", { month:"short", day:"numeric", year:"numeric" }),
          image: item.thumbnail || item.enclosure?.link,
          link: item.link,
        }));
      setDrops(items);
    } catch(err) {
      console.error("Could not fetch drops");
    } finally { setDropsLoading(false); }
  }, []);

  useEffect(() => {
    if (tab === "drops" && drops.length === 0) fetchDrops();
  }, [tab, drops.length, fetchDrops]);

  const compressAndSetImage = useCallback((file) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        const maxSize = 1024;
        let w = img.width, h = img.height;
        if (w > maxSize || h > maxSize) {
          if (w > h) { h = (h / w) * maxSize; w = maxSize; }
          else { w = (w / h) * maxSize; h = maxSize; }
        }
        canvas.width = w; canvas.height = h;
        canvas.getContext("2d").drawImage(img, 0, 0, w, h);
        const compressed = canvas.toDataURL("image/jpeg", 0.8).split(",")[1];
        setImageBase64(compressed);
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  }, []);

  const handleFile = useCallback((file) => {
    if (!file || !file.type.startsWith("image/")) return;
    setImage(URL.createObjectURL(file));
    setResult(null); setError(null); setCalcResult(null); setAccuracyRating(null);
    compressAndSetImage(file);
  }, [compressAndSetImage]);

  const handleDrop = (e) => {
    e.preventDefault(); setHover(false);
    handleFile(e.dataTransfer.files[0]);
  };

  const analyze = async () => {
    if (!imageBase64) return;
    setLoading(true); setError(null);
    try {
      const prompt = `You are a sneaker market analyst with deep expertise in StockX, GOAT, and eBay resale prices in 2026. FIRST: If this image does not contain a sneaker, return exactly: {"error": "not_a_sneaker"}. If it IS a sneaker, identify the exact model and colorway by examining colors, materials, and branding carefully. Return ONLY this JSON with no markdown: { "brand": "exact brand", "name": "exact full model name and colorway", "colorway": "exact colorway name", "year": "original release year", "sku": "SKU if known else empty string", "confidence": 95, "retail_price": 180, "new_price_low": 220, "new_price_high": 380, "new_price_avg": 290, "used_price_low": 140, "used_price_high": 240, "used_price_avg": 185, "market_sentiment": "Hot", "demand_score": 78, "resell_potential": 65, "rarity_score": 55, "trend_momentum": 82, "insight": "Write 3 specific sentences about this exact shoe mentioning its release year, what drove its hype, and whether 2026 market conditions favor buying or selling right now.", "buy_recommendation": "Buy" }. All scores 0-100. Base prices on real 2026 StockX market data for this specific model and colorway.`;

      const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${API_KEY}`
        },
        body: JSON.stringify({
          model: "anthropic/claude-sonnet-4.6",
          messages: [{
            role: "user",
            content: [
              { type: "image_url", image_url: { url: `data:image/jpeg;base64,${imageBase64}` } },
              { type: "text", text: prompt }
            ]
          }]
        })
      });

      const data = await response.json();
      const text = data.choices?.[0]?.message?.content || "";
      const parsed = parseJSON(text);
      if (!parsed) throw new Error("Could not parse response");
      if (parsed.error === "not_a_sneaker") {
        setError("No sneaker detected. Please upload a photo of a sneaker.");
        return;
      }
      setResult(parsed);
    } catch(err) {
      setError("Could not identify this sneaker. Try a clearer photo with better lighting.");
    } finally { setLoading(false); }
  };

  const reset = () => {
    setImage(null); setImageBase64(null);
    setResult(null); setError(null); setCalcResult(null);
    setCalcPrice(""); setCalcSize(""); setAccuracyRating(null);
    setSuggestion(""); setSuggestionSent(false);
  };

  const saveToWatchlist = () => {
    if (!result) return;
    const id = `${result.name}-${Date.now()}`;
    setWatchlist(prev => [{ ...result, id, image }, ...prev]);
    setSavedToast(true);
    setTimeout(() => setSavedToast(false), 2200);
  };

  const calcProfit = () => {
    if (!result || !calcPrice) return;
    const paid = parseFloat(calcPrice);
    const conditionMultiplier = calcCondition === "new" ? 1 : 0.72;
    const rareSmall = ["3","3.5","4","4.5","5","5.5"];
    const rareLarge = ["14","14.5","15","16","17"];
    const sizeMultiplier = rareSmall.includes(calcSize) ? 1.1
      : rareLarge.includes(calcSize) ? 1.2
      : ["7","7.5","8","8.5","9","9.5","10","10.5","11"].includes(calcSize) ? 1.0
      : 0.95;
    const sentimentMultiplier =
      result.market_sentiment?.toLowerCase() === "hot" ? 1.1 :
      result.market_sentiment?.toLowerCase() === "rising" ? 1.05 :
      result.market_sentiment?.toLowerCase() === "cooling" ? 0.9 : 1;
    const basePrice = calcCondition === "new" ? result.new_price_avg : result.used_price_avg;
    const estimatedSell = Math.round(basePrice * conditionMultiplier * sizeMultiplier * sentimentMultiplier);
    const profit = estimatedSell - paid;
    const roi = Math.round((profit / paid) * 100);
    setCalcResult({ paid, estimatedSell, profit, roi });
  };

  const removeFromWatchlist = (id) => setWatchlist(prev => prev.filter(i => i.id !== id));
  const isInWatchlist = result && watchlist.some(i => i.name === result.name);
  const buyColor = result?.buy_recommendation === "Buy" ? ACCENT : result?.buy_recommendation === "Sell" ? "#ff5533" : ORANGE;

  return (
    <div style={{ minHeight:"100vh", background:DARK, color:TEXT, fontFamily:"'Inter','Helvetica Neue',sans-serif", display:"flex", flexDirection:"column", alignItems:"center", paddingBottom:80 }}>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>

      {savedToast && (
        <div style={{ position:"fixed", top:20, left:"50%", transform:"translateX(-50%)", background:ACCENT, color:DARK, borderRadius:99, padding:"10px 22px", fontWeight:700, fontSize:13, zIndex:999 }}>
          ✓ Added to Watchlist
        </div>
      )}

      <div style={{ width:"100%", maxWidth:480, padding:"28px 20px 0", display:"flex", alignItems:"center", justifyContent:"space-between" }}>
        <div>
          <div style={{ fontWeight:800, fontSize:22, letterSpacing:"-0.5px" }}>
            Shoe<span style={{ color:ACCENT }}>IQ</span>
          </div>
          <div style={{ fontSize:11, color:SUBTEXT, letterSpacing:"2px", textTransform:"uppercase" }}>Sneaker Market Intel</div>
        </div>
        <div style={{ display:"flex", gap:4, background:CARD, borderRadius:12, padding:4 }}>
          {["scan","drops","watchlist"].map(t => (
            <button key={t} onClick={() => setTab(t)} style={{ background:tab===t?MUTED:"transparent", border:"none", color:tab===t?TEXT:SUBTEXT, borderRadius:8, padding:"6px 10px", fontSize:11, fontWeight:600, cursor:"pointer", textTransform:"capitalize" }}>
              {t === "watchlist" ? `List${watchlist.length ? ` (${watchlist.length})` : ""}` : t === "drops" ? "📅 Drops" : "Scan"}
            </button>
          ))}
        </div>
      </div>

      <div style={{ width:"100%", maxWidth:480, padding:"20px 20px 0", display:"flex", flexDirection:"column", gap:16 }}>

        {tab === "watchlist" && (
          <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
            {watchlist.length === 0 ? (
              <div style={{ background:CARD, borderRadius:20, padding:"48px 24px", textAlign:"center", color:SUBTEXT }}>
                <div style={{ fontSize:36, marginBottom:12 }}>👟</div>
                <div style={{ fontWeight:600, marginBottom:6 }}>No sneakers saved yet</div>
                <div style={{ fontSize:13 }}>Scan a sneaker and save it to Watchlist</div>
              </div>
            ) : watchlist.map(item => <WatchlistCard key={item.id} item={item} onRemove={removeFromWatchlist} />)}
          </div>
        )}

        {tab === "drops" && (
          <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
            <div style={{ fontSize:11, color:SUBTEXT, letterSpacing:"2px", textTransform:"uppercase", fontWeight:600 }}>Upcoming Releases</div>
            {dropsLoading && (
              <div style={{ display:"flex", justifyContent:"center", padding:"40px 0" }}>
                <div style={{ width:36, height:36, border:`3px solid ${MUTED}`, borderTop:`3px solid ${ACCENT}`, borderRadius:"50%", animation:"spin 0.8s linear infinite" }} />
              </div>
            )}
            {!dropsLoading && drops.length === 0 && (
              <div style={{ background:CARD, borderRadius:20, padding:"40px 24px", textAlign:"center", color:SUBTEXT }}>
                <div style={{ fontSize:13 }}>No upcoming drops found.</div>
                <button onClick={fetchDrops} style={{ marginTop:12, background:ACCENT, color:DARK, border:"none", borderRadius:10, padding:"10px 20px", fontWeight:700, cursor:"pointer" }}>Retry</button>
              </div>
            )}
            {!dropsLoading && drops.map((drop, i) => (
              <a key={i} href={drop.link} target="_blank" rel="noopener noreferrer" style={{ textDecoration:"none" }}>
                <div style={{ background:CARD, borderRadius:16, overflow:"hidden" }}>
                  {drop.image && <img src={drop.image} alt="" style={{ width:"100%", height:160, objectFit:"cover", display:"block" }} />}
                  <div style={{ padding:"14px 16px", display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                    <div>
                      <div style={{ fontSize:14, fontWeight:700, color:TEXT, marginBottom:4 }}>{drop.name}</div>
                      <div style={{ fontSize:12, color:SUBTEXT }}>📅 {drop.releaseDate}</div>
                    </div>
                    <span style={{ fontSize:12, color:ACCENT, fontWeight:600, flexShrink:0, marginLeft:8 }}>View →</span>
                  </div>
                </div>
              </a>
            ))}
          </div>
        )}

        {tab === "scan" && (
          <>
            {!result && (
              <>
                <div
                  style={{ border:`2px dashed ${hover?ACCENT:MUTED}`, borderRadius:20, height:240, display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", cursor:"pointer", background:hover?"#1a1f10":CARD, transition:"all 0.2s", position:"relative", overflow:"hidden" }}
                  onClick={() => inputRef.current?.click()}
                  onDragOver={(e) => { e.preventDefault(); setHover(true); }}
                  onDragLeave={() => setHover(false)}
                  onDrop={handleDrop}
                >
                  {image
                    ? <img src={image} alt="sneaker" style={{ width:"100%", height:"100%", objectFit:"cover", borderRadius:18 }} />
                    : <>
                        <div style={{ fontSize:40, marginBottom:12, opacity:0.4 }}>👟</div>
                        <div style={{ color:SUBTEXT, fontSize:14, fontWeight:500 }}>Drop a sneaker photo</div>
                        <div style={{ color:"#555", fontSize:12, marginTop:4 }}>or click to upload</div>
                        <div style={{ color:"#444", fontSize:11, marginTop:8, textAlign:"center", padding:"0 20px" }}>💡 Best results with clear photos of the shoe</div>
                      </>
                  }
                  <input ref={inputRef} type="file" accept="image/jpeg,image/png,image/webp,image/*" style={{ display:"none" }} onChange={(e) => handleFile(e.target.files[0])} />
                </div>

                {error && <div style={{ background:"#1a0d0d", border:"1px solid #ff444422", borderRadius:14, padding:"14px 16px", color:"#ff8888", fontSize:13 }}>⚠️ {error}</div>}

                {loading ? (
                  <div style={{ display:"flex", flexDirection:"column", alignItems:"center", gap:12, padding:"28px 0" }}>
                    <div style={{ width:40, height:40, border:`3px solid ${MUTED}`, borderTop:`3px solid ${ACCENT}`, borderRadius:"50%", animation:"spin 0.8s linear infinite" }} />
                    <div style={{ color:SUBTEXT, fontSize:14 }}>Analyzing with ShoeIQ…</div>
                  </div>
                ) : (
                  <button onClick={analyze} disabled={!imageBase64} style={{ background:ACCENT, color:DARK, border:"none", borderRadius:14, padding:"16px 0", fontSize:15, fontWeight:700, cursor:imageBase64?"pointer":"not-allowed", opacity:imageBase64?1:0.35, width:"100%" }}>
                    {image ? "Analyze Sneaker" : "Upload a Photo First"}
                  </button>
                )}
              </>
            )}

            {result && (
              <div style={{ display:"flex", flexDirection:"column", gap:16 }}>
                {image && <div style={{ borderRadius:20, overflow:"hidden", height:200 }}><img src={image} alt="sneaker" style={{ width:"100%", height:"100%", objectFit:"cover" }} /></div>}

                <div style={{ background:CARD, borderRadius:20, padding:"22px 20px", display:"flex", flexDirection:"column", gap:18 }}>
                  <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start" }}>
                    <div style={{ flex:1 }}>
                      <div style={{ fontSize:11, color:ACCENT, letterSpacing:"3px", textTransform:"uppercase", fontWeight:600, marginBottom:3 }}>{result.brand}</div>
                      <div style={{ fontSize:20, fontWeight:800, lineHeight:1.25 }}>{result.name}</div>
                      {result.colorway && <div style={{ fontSize:13, color:SUBTEXT, marginTop:2 }}>{result.colorway}</div>}
                      <div style={{ display:"flex", gap:8, marginTop:8, flexWrap:"wrap" }}>
                        <span style={{ display:"inline-flex", alignItems:"center", gap:5, background:"#1a1f10", border:`1px solid ${ACCENT}33`, color:ACCENT, borderRadius:99, padding:"4px 12px", fontSize:12, fontWeight:600 }}>✦ {result.confidence}% match</span>
                        <MarketBadge sentiment={result.market_sentiment} />
                      </div>
                    </div>
                    <div style={{ background:`${buyColor}22`, border:`1px solid ${buyColor}44`, color:buyColor, borderRadius:12, padding:"8px 14px", fontSize:13, fontWeight:800, flexShrink:0, marginLeft:10 }}>
                      {result.buy_recommendation || "Hold"}
                    </div>
                  </div>

                  <div style={{ height:1, background:MUTED, margin:"0 -20px" }} />

                  <div>
                    <div style={{ fontSize:11, color:SUBTEXT, letterSpacing:"2px", textTransform:"uppercase", fontWeight:600, marginBottom:10 }}>Price Points</div>
                    <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
                      <div style={{ background:"#1C1C1C", borderRadius:14, padding:"16px 14px", borderTop:`2px solid ${ACCENT}` }}>
                        <div style={{ fontSize:11, color:SUBTEXT, textTransform:"uppercase", marginBottom:6 }}>New / DS</div>
                        <div style={{ fontSize:26, fontWeight:800, color:ACCENT }}>${result.new_price_avg}</div>
                        <div style={{ fontSize:11, color:SUBTEXT, marginTop:3 }}>${result.new_price_low}–${result.new_price_high}</div>
                      </div>
                      <div style={{ background:"#1C1C1C", borderRadius:14, padding:"16px 14px", borderTop:"2px solid #aaa" }}>
                        <div style={{ fontSize:11, color:SUBTEXT, textTransform:"uppercase", marginBottom:6 }}>Used</div>
                        <div style={{ fontSize:26, fontWeight:800, color:"#ddd" }}>${result.used_price_avg}</div>
                        <div style={{ fontSize:11, color:SUBTEXT, marginTop:3 }}>${result.used_price_low}–${result.used_price_high}</div>
                      </div>
                    </div>
                    {result.retail_price > 0 && (
                      <div style={{ marginTop:10, fontSize:12, color:SUBTEXT }}>
                        Retail: <span style={{ color:TEXT }}>${result.retail_price}</span> · Premium: <span style={{ color:ACCENT }}>+{Math.round(((result.new_price_avg - result.retail_price) / result.retail_price) * 100)}%</span>
                      </div>
                    )}
                    <div style={{ marginTop:8, fontSize:11, color:"#555" }}>⚠️ Prices are AI estimates. Verify on StockX or GOAT before buying or selling.</div>
                  </div>

                  <div style={{ height:1, background:MUTED, margin:"0 -20px" }} />

                  <div>
                    <div style={{ fontSize:11, color:SUBTEXT, letterSpacing:"2px", textTransform:"uppercase", fontWeight:600, marginBottom:10 }}>Market Signals</div>
                    <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
                      {[
                        { label:"Demand",     val:result.demand_score },
                        { label:"Resell ROI", val:result.resell_potential },
                        { label:"Rarity",     val:result.rarity_score },
                        { label:"Momentum",   val:result.trend_momentum },
                      ].map(({ label, val }) => (
                        <div key={label} style={{ display:"flex", alignItems:"center", gap:10 }}>
                          <div style={{ fontSize:13, color:TEXT, width:90, flexShrink:0 }}>{label}</div>
                          <div style={{ flex:1, height:6, background:MUTED, borderRadius:99, overflow:"hidden" }}>
                            <div style={{ height:"100%", width:`${val}%`, background:ACCENT, borderRadius:99 }} />
                          </div>
                          <div style={{ fontSize:12, color:SUBTEXT, width:36, textAlign:"right" }}>{val}</div>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div style={{ height:1, background:MUTED, margin:"0 -20px" }} />

                  <div>
                    <div style={{ fontSize:11, color:SUBTEXT, letterSpacing:"2px", textTransform:"uppercase", fontWeight:600, marginBottom:10 }}>Market Insight</div>
                    <div style={{ background:"#1a1f10", border:`1px solid ${ACCENT}22`, borderRadius:14, padding:"14px 16px" }}>
                      <div style={{ fontSize:13, color:"#ccc", lineHeight:1.6 }}>{result.insight}</div>
                    </div>
                  </div>

                  <div style={{ height:1, background:MUTED, margin:"0 -20px" }} />

                  <div>
                    <div style={{ fontSize:11, color:SUBTEXT, letterSpacing:"2px", textTransform:"uppercase", fontWeight:600, marginBottom:10 }}>Shop & Compare</div>
                    <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
                      {[
                        { name:"StockX", url:buildStockXUrl(result.name, result.sku), color:"#00C853", emoji:"📦" },
                        { name:"GOAT",   url:buildGOATUrl(result.name, result.sku),   color:"#1976D2", emoji:"🐐" },
                        { name:"eBay",   url:buildEbayUrl(result.name, result.sku),   color:"#E53238", emoji:"🛒" },
                      ].map(({ name, url, color, emoji }) => (
                        <a key={name} href={url} target="_blank" rel="noopener noreferrer" style={{ display:"flex", alignItems:"center", justifyContent:"space-between", background:"#1C1C1C", border:`1px solid ${MUTED}`, borderRadius:12, padding:"12px 16px", textDecoration:"none" }}>
                          <div style={{ display:"flex", alignItems:"center", gap:10 }}>
                            <span style={{ fontSize:18 }}>{emoji}</span>
                            <span style={{ fontSize:14, fontWeight:700, color:TEXT }}>{name}</span>
                          </div>
                          <span style={{ color, fontSize:12, fontWeight:600 }}>View listing →</span>
                        </a>
                      ))}
                    </div>
                  </div>
                </div>

                <div style={{ background:CARD, borderRadius:20, padding:"22px 20px" }}>
                  <div style={{ fontSize:11, color:SUBTEXT, letterSpacing:"2px", textTransform:"uppercase", fontWeight:600, marginBottom:16 }}>🧮 Flip Calculator</div>
                  <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
                    <div>
                      <div style={{ fontSize:12, color:SUBTEXT, marginBottom:6 }}>What did you pay?</div>
                      <input type="number" placeholder="$0" value={calcPrice} onChange={(e) => setCalcPrice(e.target.value)}
                        style={{ width:"100%", background:"#1C1C1C", border:`1px solid ${MUTED}`, borderRadius:10, padding:"10px 14px", color:TEXT, fontSize:15, outline:"none", boxSizing:"border-box" }} />
                    </div>
                    <div>
                      <div style={{ fontSize:12, color:SUBTEXT, marginBottom:6 }}>Size</div>
                      <input type="text" placeholder="e.g. 10.5" value={calcSize} onChange={(e) => setCalcSize(e.target.value)}
                        style={{ width:"100%", background:"#1C1C1C", border:`1px solid ${MUTED}`, borderRadius:10, padding:"10px 14px", color:TEXT, fontSize:15, outline:"none", boxSizing:"border-box" }} />
                    </div>
                    <div>
                      <div style={{ fontSize:12, color:SUBTEXT, marginBottom:6 }}>Condition</div>
                      <div style={{ display:"flex", gap:8 }}>
                        {["new","used"].map(c => (
                          <button key={c} onClick={() => setCalcCondition(c)} style={{ flex:1, padding:"10px 0", borderRadius:10, border:`1px solid ${calcCondition===c?ACCENT:MUTED}`, background:calcCondition===c?"#1a1f10":"#1C1C1C", color:calcCondition===c?ACCENT:SUBTEXT, fontSize:13, fontWeight:600, cursor:"pointer" }}>
                            {c === "new" ? "New / DS" : "Used"}
                          </button>
                        ))}
                      </div>
                    </div>
                    <button onClick={calcProfit} style={{ background:ACCENT, color:DARK, border:"none", borderRadius:12, padding:"13px 0", fontSize:14, fontWeight:700, cursor:"pointer", width:"100%", marginTop:4 }}>
                      Calculate Profit
                    </button>
                    {calcResult && (
                      <div style={{ background:"#1C1C1C", borderRadius:14, padding:"16px" }}>
                        <div style={{ display:"flex", justifyContent:"space-between", marginBottom:8 }}>
                          <span style={{ color:SUBTEXT, fontSize:13 }}>You paid</span>
                          <span style={{ color:TEXT, fontWeight:700 }}>${calcResult.paid}</span>
                        </div>
                        <div style={{ display:"flex", justifyContent:"space-between", marginBottom:8 }}>
                          <span style={{ color:SUBTEXT, fontSize:13 }}>Est. sell price</span>
                          <span style={{ color:TEXT, fontWeight:700 }}>${calcResult.estimatedSell}</span>
                        </div>
                        <div style={{ height:1, background:MUTED, margin:"8px 0" }} />
                        <div style={{ display:"flex", justifyContent:"space-between", marginBottom:6 }}>
                          <span style={{ color:SUBTEXT, fontSize:13 }}>Est. profit</span>
                          <span style={{ fontSize:18, fontWeight:800, color:calcResult.profit >= 0 ? ACCENT : "#ff5533" }}>
                            {calcResult.profit >= 0 ? "+" : ""}${calcResult.profit}
                          </span>
                        </div>
                        <div style={{ display:"flex", justifyContent:"space-between" }}>
                          <span style={{ color:SUBTEXT, fontSize:13 }}>ROI</span>
                          <span style={{ fontSize:15, fontWeight:700, color:calcResult.roi >= 0 ? ACCENT : "#ff5533" }}>
                            {calcResult.roi >= 0 ? "+" : ""}{calcResult.roi}%
                          </span>
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                <div style={{ background:CARD, borderRadius:20, padding:"22px 20px" }}>
                  <div style={{ fontSize:11, color:SUBTEXT, letterSpacing:"2px", textTransform:"uppercase", fontWeight:600, marginBottom:12 }}>✅ Was this analysis accurate?</div>
                  {!accuracyRating ? (
                    <div style={{ display:"flex", gap:8 }}>
                      {[
                        { label:"✅ Accurate", val:"accurate", color:"#00C853" },
                        { label:"⚠️ Partially", val:"partial", color:ORANGE },
                        { label:"❌ Inaccurate", val:"inaccurate", color:"#ff5533" },
                      ].map(({ label, val, color }) => (
                        <button key={val} onClick={() => setAccuracyRating(val)} style={{ flex:1, padding:"10px 6px", borderRadius:10, border:`1px solid ${MUTED}`, background:"#1C1C1C", color, fontSize:12, fontWeight:600, cursor:"pointer" }}>
                          {label}
                        </button>
                      ))}
                    </div>
                  ) : (
                    <div style={{ fontSize:13, color:SUBTEXT, textAlign:"center", padding:"8px 0" }}>
                      Thanks for the feedback! 🙏
                    </div>
                  )}
                </div>

                <div style={{ background:CARD, borderRadius:20, padding:"22px 20px" }}>
                  <div style={{ fontSize:11, color:SUBTEXT, letterSpacing:"2px", textTransform:"uppercase", fontWeight:600, marginBottom:12 }}>💡 Suggestions</div>
                  {!suggestionSent ? (
                    <>
                      <textarea
                        placeholder="Have a suggestion for ShoeIQ? Let us know..."
                        value={suggestion}
                        onChange={(e) => setSuggestion(e.target.value)}
                        style={{ width:"100%", background:"#1C1C1C", border:`1px solid ${MUTED}`, borderRadius:10, padding:"12px 14px", color:TEXT, fontSize:13, outline:"none", boxSizing:"border-box", resize:"none", height:80, fontFamily:"inherit" }}
                      />
                      <button
                        onClick={() => { if(suggestion.trim()) setSuggestionSent(true); }}
                        disabled={!suggestion.trim()}
                        style={{ marginTop:8, width:"100%", background:suggestion.trim()?ACCENT:"#1C1C1C", color:suggestion.trim()?DARK:SUBTEXT, border:"none", borderRadius:10, padding:"12px 0", fontSize:13, fontWeight:700, cursor:suggestion.trim()?"pointer":"not-allowed" }}>
                        Send Suggestion
                      </button>
                    </>
                  ) : (
                    <div style={{ fontSize:13, color:SUBTEXT, textAlign:"center", padding:"8px 0" }}>
                      Thanks! We'll review your suggestion 🙏
                    </div>
                  )}
                </div>

                <button onClick={saveToWatchlist} disabled={isInWatchlist} style={{ background:isInWatchlist?MUTED:ACCENT, color:isInWatchlist?SUBTEXT:DARK, border:"none", borderRadius:14, padding:"15px 0", fontSize:15, fontWeight:700, cursor:isInWatchlist?"default":"pointer", width:"100%" }}>
                  {isInWatchlist ? "✓ Saved to Watchlist" : "＋ Save to Watchlist"}
                </button>

                <button onClick={reset} style={{ background:"transparent", border:`1px solid ${MUTED}`, color:SUBTEXT, borderRadius:14, padding:"13px 0", fontSize:14, cursor:"pointer", width:"100%" }}>
                  Scan Another Sneaker
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
