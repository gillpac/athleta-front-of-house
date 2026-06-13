import { useState } from "react";

/* ============================================================
   ATHLETA — FRONT-OF-HOUSE SYSTEM PROTOTYPE v7
   v7: trial rows are a left→right step sequence ending in the
   SALE · "not contacted" alarm on new leads · relationship label
   (mother/father/guardian) · age calculated from DOB · Stats tab
   (leads this week / month etc.) · profile is functional: resend
   form, change programme · next-action hints on every row.
   ============================================================ */

const C = {
  ink: "#17130E", inkSoft: "#2B2521", orange: "#E26839", orangeDark: "#B94E22",
  bg: "#F6F3EE", card: "#FFFFFF", sand: "#EFE8DE", line: "#D9CFC2", lineSoft: "#E8E1D6",
  muted: "#84776A",
  green: "#27865C", greenDark: "#1E6B49", greenBg: "#DFF0E6",
  yellow: "#9A7409", yellowBg: "#FBF1CF",
  red: "#B23A24", redBg: "#F6DCD4",
  grey: "#6E655B", greyBg: "#ECE7DF",
};
const FONT = "'Nunito', system-ui, sans-serif";
const USER = { name: "Chiara", site: "Coolaroo" };
const TARGET = { month: "June", goal: 40, actual: 14, daysLeft: 18 };
const STATS = { leadsWeek: 16, leadsMonth: 64, trialsBookedWeek: 13, trialsBookedMonth: 52, attendedMonth: 41, salesMonthPrior: 5, noShowsMonth: 11, cancelsMonth: 4 };

/* age from dd/mm/yyyy */
const TODAY = new Date(2026, 5, 12);
/* operating days remaining this month: Mon–Sat (Sundays excluded) */
const opDaysLeft = () => {
  const end = new Date(TODAY.getFullYear(), TODAY.getMonth() + 1, 0);
  let n = 0;
  for (let d = new Date(TODAY.getTime() + 86400000); d <= end; d = new Date(d.getTime() + 86400000)) if (d.getDay() !== 0) n++;
  return n;
};
const OP_DAYS_LEFT = opDaysLeft();
const wonSeed = (child, parent, rel, phone, dob, soldDate, slot, prog) => ({
  status: "won", child, parent, rel, phone, email: `${child.split(" ")[0].toLowerCase()}@example.com`, received: soldDate, dob, soldDate, contacted: true,
  programme: prog, formBack: true, firstClass: { date: soldDate, slot },
  iclass: { class: true, regoins: true, payment: true, verified: true },
  enquiry: { relationship: rel, guardian: parent, mobile: phone, email: "—", childName: child, dob, gender: "—", prefDays: "—", prior: "—" },
  events: [{ who: "System", when: soldDate, text: "New lead from website form", type: "status" }, { who: "Mustafa", when: soldDate, text: `SALE 🎉 enrolled — first class ${slot}`, type: "status" }, { who: "Admin", when: soldDate, text: "Admin verified the sale ✓", type: "status" }],
});
const ageFrom = (dob) => {
  if (!dob) return "";
  const [d, m, y] = dob.split("/").map(Number);
  let a = TODAY.getFullYear() - y;
  if (TODAY.getMonth() + 1 < m || (TODAY.getMonth() + 1 === m && TODAY.getDate() < d)) a--;
  return a;
};

let _id = 1;
const EV = (who, when, text, type = "status") => ({ who, when, text, type });
const L = (o) => ({
  id: _id++, events: [], formBack: false, attendance: null, rebooks: 0, attempts: 0, confirmed: false,
  contacted: false, lastOutcome: null, prev: null, soldDate: null,
  firstClass: null, iclass: { class: false, regoins: false, payment: false, verified: false }, ...o,
});

const seed = [
  L({ status: "new", child: "Harper Liotta", parent: "Gia Liotta", rel: "Mother", phone: "0413 220 871", email: "gia.l@example.com", received: "Today 9:37 am", waitMin: 23, dob: "12/03/2022",
      enquiry: { relationship: "Mother", guardian: "Gia Liotta", mobile: "0413 220 871", email: "gia.l@example.com", childName: "Harper Liotta", dob: "12/03/2022", gender: "Female", prefDays: "Saturday", prior: "None" },
      programme: "Kinder Gym", events: [EV("System", "Today 9:37 am", "New lead from website form")] }),
  L({ status: "new", child: "Eli Osman", parent: "Sara Osman", rel: "Mother", phone: "0424 818 405", email: "sara.o@example.com", received: "Today 7:10 am", waitMin: 170, dob: "02/11/2019",
      enquiry: { relationship: "Mother", guardian: "Sara Osman", mobile: "0424 818 405", email: "sara.o@example.com", childName: "Eli Osman", dob: "02/11/2019", gender: "Male", prefDays: "Tuesday, Thursday", prior: "Played soccer; very active" },
      programme: "Beginners Principles", events: [EV("System", "Today 7:10 am", "New lead from website form")] }),
  L({ status: "new", child: "Layla Osman", parent: "Sara Osman", rel: "Mother", phone: "0424 818 405", email: "sara.o@example.com", received: "Today 7:10 am", waitMin: 170, dob: "15/06/2022",
      enquiry: { relationship: "Mother", guardian: "Sara Osman", mobile: "0424 818 405", email: "sara.o@example.com", childName: "Layla Osman", dob: "15/06/2022", gender: "Female", prefDays: "Tuesday, Thursday", prior: "None" },
      programme: "Kinder Gym", events: [EV("System", "Today 7:10 am", "New lead from website form (same enquiry as Eli — 2 children)")] }),
  L({ status: "new", child: "Jack Tran", parent: "Kim Tran", rel: "Father", phone: "0431 668 220", email: "kim.t@example.com", received: "Yesterday 8:30 am", waitMin: 1530, attempts: 2, contacted: true, lastOutcome: "Left voicemail", dob: "21/06/2020",
      enquiry: { relationship: "Father", guardian: "Kim Tran", mobile: "0431 668 220", email: "kim.t@example.com", childName: "Jack Tran", dob: "21/06/2020", gender: "Male", prefDays: "Any weekday", prior: "None" },
      programme: "Beginners Principles",
      events: [EV("System", "Yesterday 8:30 am", "New lead from website form"), EV("Mustafa", "Yesterday 2:05 pm", "Called — no answer", "comm"), EV("Mustafa", "Yesterday 4:12 pm", "Called — left voicemail", "comm"), EV("Mustafa", "Yesterday 4:12 pm", "Mum works shifts — try after 5 pm.", "note")] }),
  L({ status: "booked", child: "Mila Kovač", parent: "Ana Kovač", rel: "Mother", phone: "0401 224 678", email: "ana.k@example.com", received: "Mon 9:48 am", trialDay: 0, trialTime: "9:30 am", programme: "Kinder Gym", rebooks: 1, confirmed: true, formBack: true, dob: "30/08/2022",
      enquiry: { relationship: "Mother", guardian: "Ana Kovač", mobile: "0401 224 678", email: "ana.k@example.com", childName: "Mila Kovač", dob: "30/08/2022", gender: "Female", prefDays: "Saturday", prior: "None" },
      events: [EV("System", "Mon 9:48 am", "New lead from website form"), EV("Chiara", "Mon 10:01 am", "Trial booked — Sat 9:30 am, Kinder Gym"), EV("Chiara", "Mon 10:03 am", "Confirmation email sent", "comm"), EV("Chiara", "Tue 8:15 am", "Jotform received ✓")] }),
  L({ status: "booked", child: "Aarav Patel", parent: "Priya Patel", rel: "Mother", phone: "0412 558 901", email: "priya.p@example.com", received: "Sun 6:15 pm", trialDay: 0, trialTime: "4:00 pm", programme: "Beginners Principles", confirmed: true, formBack: true, dob: "14/02/2021",
      enquiry: { relationship: "Mother", guardian: "Priya Patel", mobile: "0412 558 901", email: "priya.p@example.com", childName: "Aarav Patel", dob: "14/02/2021", gender: "Male", prefDays: "Weekdays after 4", prior: "A term of swimming" },
      events: [EV("System", "Sun 6:15 pm", "New lead from website form"), EV("Mustafa", "Mon 9:20 am", "Trial booked — today 4:00 pm"), EV("Mustafa", "Mon 9:22 am", "Confirmation email sent", "comm"), EV("System", "Wed 7:40 pm", "Jotform received ✓")] }),
  L({ status: "booked", child: "Ruby Walsh", parent: "Claire Walsh", rel: "Mother", phone: "0407 119 482", email: "claire.w@example.com", received: "Sat 11:05 am", trialDay: 0, trialTime: "5:30 pm", programme: "Beginners Principles", confirmed: true, formBack: false, dob: "19/05/2019",
      enquiry: { relationship: "Mother", guardian: "Claire Walsh", mobile: "0407 119 482", email: "claire.w@example.com", childName: "Ruby Walsh", dob: "19/05/2019", gender: "Female", prefDays: "Mon, Wed", prior: "None" },
      events: [EV("System", "Sat 11:05 am", "New lead from website form"), EV("Chiara", "Sat 11:30 am", "Trial booked — today 5:30 pm"), EV("Chiara", "Sat 11:31 am", "Confirmation email sent", "comm")] }),
  L({ status: "booked", child: "Zara Haddad", parent: "Lina Haddad", rel: "Mother", phone: "0422 671 350", email: "lina.h@example.com", received: "Tue 2:21 pm", trialDay: 1, trialTime: "10:00 am", programme: "Kinder Gym", formBack: false, dob: "03/09/2021",
      enquiry: { relationship: "Mother", guardian: "Lina Haddad", mobile: "0422 671 350", email: "lina.h@example.com", childName: "Zara Haddad", dob: "03/09/2021", gender: "Female", prefDays: "Saturday", prior: "None" },
      events: [EV("System", "Tue 2:21 pm", "New lead from website form"), EV("Chiara", "Tue 3:05 pm", "Trial booked — tomorrow 10:00 am")] }),
  L({ status: "noshow", child: "Sienna Bruno", parent: "Marco Bruno", rel: "Father", phone: "0410 552 308", email: "marco.b@example.com", received: "2 Jun 3:30 pm", programme: "Kinder Gym", rebooks: 1, dob: "16/04/2022",
      enquiry: { relationship: "Father", guardian: "Marco Bruno", mobile: "0410 552 308", email: "marco.b@example.com", childName: "Sienna Bruno", dob: "16/04/2022", gender: "Female", prefDays: "Saturday", prior: "None" },
      events: [EV("System", "2 Jun 3:30 pm", "New lead from website form"), EV("Chiara", "3 Jun", "Trial booked — Sat 9:30 am"), EV("Chiara", "Sat 10:15 am", "Marked no-show")] }),
  L({ status: "nurture", child: "Noah Said", parent: "Yusra Said", rel: "Mother", phone: "0421 775 940", email: "yusra.s@example.com", received: "30 May 10:12 am", programme: "Kinder Gym", dob: "08/07/2021",
      enquiry: { relationship: "Mother", guardian: "Yusra Said", mobile: "0421 775 940", email: "yusra.s@example.com", childName: "Noah Said", dob: "08/07/2021", gender: "Male", prefDays: "Friday", prior: "None" },
      events: [EV("System", "30 May 10:12 am", "New lead from website form"), EV("Mustafa", "Sat 12:35 pm", "Attended trial — didn't enrol (comparing options)"), EV("Mustafa", "Sat 12:40 pm", "Dad comparing with swim lessons. Call back next week.", "note")] }),
  L(wonSeed("Ava Ricci", "Carla Ricci", "Mother", "0418 200 113", "05/05/2020", "3 Jun", "Tue 4:00 pm Beginners", "Beginners Principles")),
  L(wonSeed("Marcus Webb", "Dan Webb", "Father", "0402 331 909", "22/10/2022", "4 Jun", "Sat 9:30 am Kinder Gym", "Kinder Gym")),
  L(wonSeed("Lily Tomasi", "Rosa Tomasi", "Mother", "0435 887 240", "17/01/2020", "6 Jun", "Wed 4:30 pm Beginners", "Beginners Principles")),
  L(wonSeed("Hana Yusuf", "Amal Yusuf", "Mother", "0427 660 035", "09/12/2021", "9 Jun", "Sat 10:30 am Kinder Gym", "Kinder Gym")),
  L(wonSeed("Oscar Lim", "Jen Lim", "Mother", "0411 502 668", "28/03/2019", "11 Jun", "Thu 5:00 pm Beginners", "Beginners Principles")),
];

const CSTAGES = ["Form received", "Save attempt", "Processed in iClassPro", "Verified + email sent"];
const seedCancels = [{ id: 900, member: "Lucas Romano", noticeDate: "9 June", effective: "23 June", reason: "Moved away", stage: 1, outcome: null }];
const seedActivity = [{ when: "8:42 am", who: USER.name, action: "Logged in" }];
const seedChecklist = [
  { id: 1, label: "Reception tidy & signage out", done: false },
  { id: 2, label: "Check voicemails & missed calls", done: false },
  { id: 3, label: "Mats & equipment walk-through", done: false },
  { id: 4, label: "Bathrooms checked & stocked", done: false },
  { id: 5, label: "End of day — banking & lock-up", done: false },
];

const waitLabel = (m) => (m < 60 ? `${m} min` : m < 1440 ? `${Math.round(m / 60)} hrs` : `${Math.round(m / 1440)} days`);

const Tag = ({ children, tone = "grey", onClick, title, solid }) => {
  const map = { green: [C.green, C.greenBg], yellow: [C.yellow, C.yellowBg], red: [C.red, C.redBg], grey: [C.grey, C.greyBg] };
  const [fg, bg] = map[tone];
  return <span onClick={onClick} title={title} style={{ background: solid ? fg : bg, color: solid ? "#fff" : fg, fontSize: 10.5, fontWeight: 800, padding: "3px 8px", borderRadius: 3, letterSpacing: 0.4, textTransform: "uppercase", whiteSpace: "nowrap", cursor: onClick ? "pointer" : "default" }}>{children}</span>;
};
const Next = ({ children, onClick, color = C.orange, border = C.orangeDark }) => (
  <button onClick={onClick} style={{ fontFamily: FONT, fontWeight: 800, fontSize: 12, cursor: "pointer", borderRadius: 4, padding: "6px 13px", background: color, color: "#fff", border: `1px solid ${border}` }}>{children}</button>
);
const Sale = ({ children, onClick }) => <Next onClick={onClick} color={C.green} border={C.greenDark}>{children}</Next>;
const Quiet = ({ children, onClick }) => (
  <button onClick={onClick} style={{ fontFamily: FONT, fontWeight: 700, fontSize: 11.5, cursor: "pointer", borderRadius: 4, padding: "6px 10px", background: "transparent", color: C.muted, border: `1px solid ${C.lineSoft}` }}>{children}</button>
);
const colHead = { fontSize: 10, fontWeight: 900, color: C.muted, textTransform: "uppercase", letterSpacing: 1 };
const inp = { fontFamily: FONT, fontSize: 13, fontWeight: 700, padding: "8px 10px", borderRadius: 4, border: `1px solid ${C.line}`, background: "#fff" };
const lbl = { display: "flex", flexDirection: "column", gap: 4, fontSize: 11.5, fontWeight: 800, color: C.inkSoft, marginBottom: 10, textTransform: "uppercase", letterSpacing: 0.5 };

const WhoCell = ({ l, onOpen, onOpenParent }) => (
  <div>
    <div style={{ display: "flex", gap: 6, alignItems: "baseline", flexWrap: "wrap" }}>
      <button onClick={onOpen} style={{ fontFamily: FONT, fontWeight: 800, fontSize: 13.5, color: C.ink, background: "none", border: "none", padding: 0, cursor: "pointer", borderBottom: `1px dotted ${C.muted}` }}>{l.child}</button>
      <span style={{ color: C.muted, fontWeight: 700, fontSize: 11.5 }}>{ageFrom(l.dob)} yrs</span>
      {l.rebooks > 0 && <Tag tone="yellow">re-booked ×{l.rebooks}</Tag>}
    </div>
    <div style={{ fontSize: 11.5, color: C.muted, fontWeight: 700, marginTop: 1 }}>
      {(l.rel || "parent").toLowerCase()} ·{" "}
      {onOpenParent
        ? <button onClick={onOpenParent} style={{ fontFamily: FONT, fontWeight: 700, fontSize: 11.5, color: C.muted, background: "none", border: "none", padding: 0, cursor: "pointer", borderBottom: `1px dotted ${C.line}` }}>{l.parent}</button>
        : l.parent} · {l.phone}
    </div>
  </div>
);

const CALL_OUTCOMES = ["No answer", "Left voicemail", "Spoke — call back later", "Spoke — booking now"];

function LossPicker({ onConfirm, onCancel, inp: inpStyle }) {
  const [reason, setReason] = useState("Price");
  const [other, setOther] = useState("");
  const final = reason === "Other" ? (other.trim() ? `Other — ${other.trim()}` : "") : reason;
  return (
    <span style={{ display: "inline-flex", gap: 4, alignItems: "center", flexWrap: "wrap" }}>
      <select value={reason} onChange={(e) => setReason(e.target.value)} style={{ ...inpStyle, padding: "4px 6px", fontSize: 11.5 }}>
        <option>Price</option><option>Timing / not ready</option><option>Day didn't suit</option><option>Comparing options</option><option>Other</option>
      </select>
      {reason === "Other" && <input value={other} onChange={(e) => setOther(e.target.value)} placeholder="what happened?" style={{ ...inpStyle, padding: "4px 6px", fontSize: 11.5, width: 130 }} />}
      <Quiet onClick={() => final && onConfirm(final)}>confirm</Quiet>
      <Quiet onClick={onCancel}>✕</Quiet>
    </span>
  );
}function CallMenu({ onPick, onClose }) {
  return (
    <div style={{ position: "absolute", top: "105%", right: 0, background: "#fff", border: `1px solid ${C.line}`, borderRadius: 4, boxShadow: "0 10px 30px rgba(0,0,0,.2)", zIndex: 30, minWidth: 190 }} onMouseLeave={onClose}>
      <div style={{ ...colHead, padding: "7px 10px", borderBottom: `1px solid ${C.lineSoft}` }}>I called — what happened?</div>
      {CALL_OUTCOMES.map((o) => (
        <button key={o} onClick={() => onPick(o)} style={{ display: "block", width: "100%", textAlign: "left", fontFamily: FONT, fontSize: 12.5, fontWeight: 700, padding: "8px 10px", background: "none", border: "none", borderBottom: `1px solid ${C.lineSoft}`, cursor: "pointer", color: C.inkSoft }}>{o}</button>
      ))}
    </div>
  );
}

function BookingModal({ lead, onClose, onConfirm }) {
  const [date, setDate] = useState(""); const [time, setTime] = useState("");
  const [prog, setProg] = useState(lead.programme || (ageFrom(lead.dob) < 5 ? "Kinder Gym" : "Beginners Principles"));
  const ok = date && time;
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(23,19,14,.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50 }} onClick={onClose}>
      <div style={{ background: "#fff", borderRadius: 6, padding: "22px 24px", width: 360, maxWidth: "92vw", borderTop: `3px solid ${C.orange}` }} onClick={(e) => e.stopPropagation()}>
        <h3 style={{ margin: "0 0 2px", fontSize: 16, fontWeight: 900 }}>Book trial — {lead.child}</h3>
        <div style={{ fontSize: 12, color: C.muted, fontWeight: 700, marginBottom: 14 }}>{(lead.rel || "").toLowerCase()} · {lead.parent} · {lead.phone}</div>
        <label style={lbl}>Trial date<input type="date" value={date} onChange={(e) => setDate(e.target.value)} style={inp} /></label>
        <label style={lbl}>Time<input type="time" value={time} onChange={(e) => setTime(e.target.value)} style={inp} /></label>
        <label style={lbl}>Programme<select value={prog} onChange={(e) => setProg(e.target.value)} style={inp}><option>Kinder Gym</option><option>Beginners Principles</option></select>
          <span style={{ fontSize: 10.5, color: C.muted, fontWeight: 700, textTransform: "none" }}>Suggested from age {ageFrom(lead.dob)}</span></label>
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 14 }}>
          <Quiet onClick={onClose}>Cancel</Quiet>
          <Next onClick={() => ok && onConfirm({ date, time, prog })}>{ok ? "Confirm booking" : "Pick date & time"}</Next>
        </div>
      </div>
    </div>
  );
}

function EnrolModal({ lead, onClose, onConfirm }) {
  const [date, setDate] = useState(""); const [slot, setSlot] = useState("");
  const [payTaken, setPayTaken] = useState(false);
  const ok = date && slot && payTaken;
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(23,19,14,.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50 }} onClick={onClose}>
      <div style={{ background: "#fff", borderRadius: 6, padding: "22px 24px", width: 380, maxWidth: "92vw", borderTop: `3px solid ${C.green}` }} onClick={(e) => e.stopPropagation()}>
        <h3 style={{ margin: "0 0 2px", fontSize: 16, fontWeight: 900 }}>💰 Make the sale — {lead.child}</h3>
        <div style={{ fontSize: 12, color: C.muted, fontWeight: 700, marginBottom: 12 }}>lock in their first class to complete the sale</div>
        {!lead.formBack && (
          <div style={{ background: C.yellowBg, border: `1px solid #E5D49A`, borderRadius: 4, padding: "8px 11px", marginBottom: 12, fontSize: 12, fontWeight: 800, color: C.yellow }}>
            ⚠ Their Jotform hasn't come back — get it completed before their first class.
          </div>
        )}
        <label style={lbl}>First class date<input type="date" value={date} onChange={(e) => setDate(e.target.value)} style={inp} /></label>
        <label style={lbl}>Class<input placeholder="e.g. Sat 9:30 am Kinder Gym" value={slot} onChange={(e) => setSlot(e.target.value)} style={inp} /></label>
        <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 12.5, fontWeight: 800, color: C.inkSoft, cursor: "pointer", margin: "4px 0 8px" }}>
          <input type="checkbox" checked={payTaken} onChange={(e) => setPayTaken(e.target.checked)} style={{ width: 16, height: 16, accentColor: C.green }} />
          Rego & insurance payment taken
        </label>
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 10 }}>
          <Quiet onClick={onClose}>Cancel</Quiet>
          <Sale onClick={() => ok && onConfirm({ date, slot, payTaken })}>{!date || !slot ? "Add first class" : !payTaken ? "Take payment first" : "Confirm sale 🎉"}</Sale>
        </div>
      </div>
    </div>
  );
}

const STATUS_LABEL = { new: ["red", "NOT CONTACTED"], contactedNew: ["yellow", "IN PROGRESS"], booked: ["green", "TRIAL BOOKED"], noshow: ["red", "NO-SHOW"], won: ["green", "ENROLLED"], nurture: ["yellow", "NURTURE"], lost: ["gray", "LOST"] };
const statusTag = (l) => {
  if (l.status === "new" && l.contacted) return STATUS_LABEL.contactedNew;
  return STATUS_LABEL[l.status] || ["gray", l.status.toUpperCase()];
};

function ParentProfile({ phone, leads, onClose, onOpenChild }) {
  const fam = leads.filter((l) => l.phone === phone);
  if (!fam.length) return null;
  const p = fam[0];
  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 45 }}>
      <div style={{ position: "absolute", inset: 0, background: "rgba(23,19,14,.4)" }} onClick={onClose} />
      <div style={{ position: "absolute", right: 0, top: 0, bottom: 0, width: 430, maxWidth: "94vw", background: "#fff", padding: "20px 22px", overflowY: "auto", borderLeft: `3px solid ${C.orange}` }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start" }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 800, color: C.muted, letterSpacing: ".6px" }}>PARENT / GUARDIAN</div>
            <div style={{ fontSize: 19, fontWeight: 900, color: C.ink, marginTop: 2 }}>{p.parent}</div>
            <div style={{ fontSize: 12.5, color: C.muted, fontWeight: 700, marginTop: 3 }}>{p.phone} · {p.email}</div>
          </div>
          <Quiet onClick={onClose}>✕</Quiet>
        </div>
        <div style={{ marginTop: 16, fontSize: 11, fontWeight: 800, color: C.muted, letterSpacing: ".6px" }}>CHILDREN ({fam.length})</div>
        <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 8 }}>
          {fam.map((l) => {
            const [tone, label] = statusTag(l);
            return (
              <button key={l.id} onClick={() => onOpenChild(l.id)}
                style={{ fontFamily: FONT, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, textAlign: "left", background: C.soft, border: `1px solid ${C.line}`, borderRadius: 6, padding: "10px 12px", cursor: "pointer" }}>
                <div>
                  <div style={{ fontWeight: 800, fontSize: 13.5, color: C.ink }}>{l.child} <span style={{ color: C.muted, fontWeight: 700, fontSize: 11.5 }}>{ageFrom(l.dob)} yrs</span></div>
                  <div style={{ fontSize: 11.5, color: C.muted, fontWeight: 700, marginTop: 1 }}>{l.programme || "—"}</div>
                </div>
                <Tag tone={tone}>{label}</Tag>
              </button>
            );
          })}
        </div>
        <div style={{ marginTop: 14, fontSize: 11.5, color: C.muted, fontWeight: 700 }}>One enquiry, one family — every child has their own record and journey.</div>
      </div>
    </div>
  );
}

function Profile({ lead, onClose, addNote, act, onBook, onSale, siblings = [], onOpenParent, onOpenChild }) {
  const [note, setNote] = useState("");
  const [callOpen, setCallOpen] = useState(false);
  const q = lead.enquiry;
  const bookable = lead.status === "new" || lead.status === "noshow" || lead.status === "nurture";
  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 40 }}>
      <div style={{ position: "absolute", inset: 0, background: "rgba(23,19,14,.4)" }} onClick={onClose} />
      <div style={{ position: "absolute", right: 0, top: 0, bottom: 0, width: 430, maxWidth: "94vw", background: "#fff", padding: "20px 22px", overflowY: "auto", borderLeft: `3px solid ${C.orange}` }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start" }}>
          <div>
            <h3 style={{ margin: 0, fontSize: 18, fontWeight: 900 }}>{lead.child} <span style={{ color: C.muted, fontWeight: 700, fontSize: 13 }}>{ageFrom(lead.dob)} yrs · DOB {lead.dob}</span></h3>
            <div style={{ fontSize: 12.5, color: C.muted, fontWeight: 700, marginTop: 2 }}>
              {(lead.rel || "").toLowerCase()} ·{" "}
              {onOpenParent
                ? <button onClick={onOpenParent} style={{ fontFamily: FONT, fontWeight: 700, fontSize: 12.5, color: C.muted, background: "none", border: "none", padding: 0, cursor: "pointer", borderBottom: `1px dotted ${C.line}` }}>{lead.parent}</button>
                : lead.parent} · {lead.phone}
            </div>
            {siblings.length > 0 && (
              <div style={{ display: "flex", gap: 5, marginTop: 6, flexWrap: "wrap", alignItems: "center" }}>
                <span style={{ fontSize: 11, fontWeight: 800, color: C.muted, letterSpacing: ".4px" }}>FAMILY:</span>
                {siblings.map((s) => {
                  const [tone, label] = statusTag(s);
                  return (
                    <button key={s.id} onClick={() => onOpenChild && onOpenChild(s.id)}
                      style={{ fontFamily: FONT, display: "inline-flex", gap: 6, alignItems: "center", background: C.soft, border: `1px solid ${C.line}`, borderRadius: 4, padding: "3px 8px", cursor: "pointer", fontSize: 11.5, fontWeight: 800, color: C.ink }}>
                      {s.child} <Tag tone={tone}>{label}</Tag>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
          <Quiet onClick={onClose}>Close ✕</Quiet>
        </div>

        {/* action bar — works from search too */}
        <div style={{ display: "flex", gap: 6, marginTop: 10, flexWrap: "wrap", position: "relative" }}>
          <Next onClick={() => setCallOpen(!callOpen)}>📞 Call</Next>
          <Quiet onClick={() => act(lead.id, 'Text sent', "comm")}>💬 Log text</Quiet>
          <Quiet onClick={() => act(lead.id, 'Email sent', "comm")}>✉ Log email</Quiet>
          {bookable && <Next onClick={() => onBook(lead.id)}>{lead.status === "noshow" ? "Re-book trial" : "Book trial"}</Next>}
          {(lead.status === "booked" || lead.status === "nurture") && <Sale onClick={() => onSale(lead.id)}>💰 Make the sale</Sale>}
          {lead.prev && <Quiet onClick={() => act(lead.id, "Undid: didn't enrol — back to attended trial", "status", { ...lead.prev, prev: null })}>↩ undo didn't enrol</Quiet>}
          {callOpen && (
            <div style={{ position: "absolute", top: "105%", left: 0, background: "#fff", border: `1px solid ${C.line}`, borderRadius: 4, boxShadow: "0 10px 30px rgba(0,0,0,.2)", zIndex: 30, minWidth: 190 }} onMouseLeave={() => setCallOpen(false)}>
              <div style={{ ...colHead, padding: "7px 10px", borderBottom: `1px solid ${C.lineSoft}` }}>I called — what happened?</div>
              {CALL_OUTCOMES.map((o) => (
                <button key={o} onClick={() => {
                  setCallOpen(false);
                  if (o === "Spoke — booking now") { act(lead.id, "Called — spoke, booking trial", "comm", { contacted: true, lastOutcome: o }); onBook(lead.id); }
                  else act(lead.id, `Called — ${o.toLowerCase()}`, "comm", { contacted: true, lastOutcome: o, ...(o === "No answer" || o === "Left voicemail" ? { attempts: lead.attempts + 1 } : {}) });
                }} style={{ display: "block", width: "100%", textAlign: "left", fontFamily: FONT, fontSize: 12.5, fontWeight: 700, padding: "8px 10px", background: "none", border: "none", borderBottom: `1px solid ${C.lineSoft}`, cursor: "pointer", color: C.inkSoft }}>{o}</button>
              ))}
            </div>
          )}
        </div>

        <div style={{ display: "flex", gap: 5, marginTop: 10, flexWrap: "wrap", alignItems: "center" }}>
              <select value={lead.programme} onChange={(e) => act(lead.id, `Programme changed to ${e.target.value}`, "status", { programme: e.target.value })} style={{ ...inp, padding: "3px 6px", fontSize: 11.5, fontWeight: 800 }}>
                <option>Kinder Gym</option><option>Beginners Principles</option>
              </select>
              {lead.formBack
                ? <Tag tone="green" title="Click to undo" onClick={() => act(lead.id, "Undid: Jotform received", "status", { formBack: false })}>form ✓</Tag>
                : <span style={{ display: "inline-flex", gap: 4, alignItems: "center", background: C.yellowBg, border: "1px solid #E5D49A", borderRadius: 4, padding: "3px 6px" }}>
                    <Tag tone="yellow">form pending</Tag>
                    <Quiet onClick={() => act(lead.id, "Jotform re-sent to parent", "comm")}>Resend form</Quiet>
                    <Quiet onClick={() => act(lead.id, "Jotform received ✓", "status", { formBack: true })}>Got form ✓</Quiet>
                  </span>}
              {lead.status === "won" && (lead.iclass.verified ? <Tag tone="green" solid>sale ✓</Tag> : <Tag tone="yellow">sale — pending admin</Tag>)}
              {lead.firstClass && <Tag tone="green">first class {lead.firstClass.date}</Tag>}
        </div>

        <h4 style={h4s}>Original enquiry — received {lead.received}</h4>
        <div style={{ background: C.bg, border: `1px solid ${C.lineSoft}`, borderRadius: 4, padding: "10px 12px" }}>
          {q && [["Location", USER.site], ["Booking as", q.relationship], ["Guardian", q.guardian], ["Mobile", q.mobile], ["Email", q.email],
            ["Child", q.childName], ["Date of birth", q.dob], ["Gender", q.gender], ["Preferred trial day(s)", q.prefDays], ["Prior training", q.prior]]
            .map(([k, v]) => (
              <div key={k} style={{ display: "flex", fontSize: 12.5, fontWeight: 700, padding: "3px 0", borderBottom: `1px dashed ${C.lineSoft}` }}>
                <span style={{ width: 150, color: C.muted }}>{k}</span><span style={{ color: C.inkSoft }}>{v}</span>
              </div>
            ))}
        </div>

        <h4 style={h4s}>Timeline — everything that's happened</h4>
        <div>
          {[...lead.events].reverse().map((e, i) => (
            <div key={i} style={{ display: "flex", gap: 10, padding: "7px 0", borderBottom: `1px solid ${C.lineSoft}` }}>
              <span style={{ width: 8, height: 8, borderRadius: 99, marginTop: 5, background: e.type === "note" ? C.yellow : e.type === "comm" ? "#6A8CB5" : C.orange, flexShrink: 0 }} />
              <div>
                <div style={{ fontSize: 10.5, fontWeight: 900, color: C.muted, textTransform: "uppercase", letterSpacing: 0.5 }}>{e.who} · {e.when}</div>
                <div style={{ fontSize: 13, fontWeight: 700, color: C.inkSoft }}>{e.text}</div>
              </div>
            </div>
          ))}
        </div>
        <div style={{ display: "flex", gap: 6, marginTop: 10 }}>
          <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Add a note…" style={{ ...inp, flex: 1 }} />
          <Next onClick={() => { if (note.trim()) { addNote(lead.id, note.trim()); setNote(""); } }}>Save</Next>
        </div>
      </div>
    </div>
  );
}
const h4s = { margin: "18px 0 8px", fontSize: 10.5, fontWeight: 900, textTransform: "uppercase", letterSpacing: 1.2, color: C.muted };

export default function AthletaSystem() {
  const [tab, setTab] = useState("Today");
  const [leads, setLeads] = useState(seed);
  const [cancels, setCancels] = useState(seedCancels);
  const [activity, setActivity] = useState(seedActivity);
  const [checklist, setChecklist] = useState(seedChecklist);
  const [query, setQuery] = useState("");
  const [openId, setOpenId] = useState(null);
  const [parentKey, setParentKey] = useState(null);
  const [bookingId, setBookingId] = useState(null);
  const [enrolId, setEnrolId] = useState(null);
  const [callFor, setCallFor] = useState(null);
  const [lossFor, setLossFor] = useState(null);
  const [weekOpen, setWeekOpen] = useState(false);

  const now = () => new Date().toLocaleTimeString("en-AU", { hour: "numeric", minute: "2-digit" }).toLowerCase();
  const log = (action) => setActivity((a) => [...a, { when: now(), who: USER.name, action }]);
  const upd = (id, fn) => setLeads((ls) => ls.map((l) => (l.id === id ? fn(l) : l)));
  const event = (id, text, type = "status") => upd(id, (l) => ({ ...l, events: [...l.events, EV(USER.name, `Today ${now()}`, text, type)] }));
  const act = (id, text, type, extra = {}) => { upd(id, (l) => ({ ...l, ...extra })); event(id, text, type); log(`${text} — ${leads.find((x) => x.id === id)?.child}`); };
  const addNote = (id, text) => { event(id, text, "note"); log(`Note on ${leads.find((l) => l.id === id)?.child}`); };

  const open = leads.find((l) => l.id === openId);
  const booking = leads.find((l) => l.id === bookingId);
  const enrolling = leads.find((l) => l.id === enrolId);
  const results = query.trim().length >= 2 ? leads.filter((l) => (l.child + " " + l.parent + " " + l.phone + " " + l.email).toLowerCase().includes(query.toLowerCase())) : [];

  const newLeads = leads.filter((l) => l.status === "new").sort((a, b) => b.waitMin - a.waitMin);
  const today = leads.filter((l) => l.status === "booked" && l.trialDay === 0);
  const tomorrow = leads.filter((l) => l.status === "booked" && l.trialDay === 1);
  const week = leads.filter((l) => l.status === "booked" && l.trialDay >= 2);
  const noshows = leads.filter((l) => l.status === "noshow");
  const nurture = leads.filter((l) => l.status === "nurture");
  const wins = leads.filter((l) => l.status === "won" && !l.iclass.verified);
  

  const callOutcome = (l, outcome) => {
    setCallFor(null);
    if (outcome === "Spoke — booking now") { event(l.id, "Called — spoke, booking trial", "comm"); upd(l.id, (x) => ({ ...x, contacted: true, lastOutcome: outcome })); log(`Called ${l.child} — booking`); setBookingId(l.id); return; }
    const extra = { contacted: true, lastOutcome: outcome, ...(outcome === "No answer" || outcome === "Left voicemail" ? { attempts: l.attempts + 1 } : {}) };
    act(l.id, `Called — ${outcome.toLowerCase()}`, "comm", extra);
  };
  const confirmBooking = ({ date, time, prog }) => {
    const wasNoShow = booking.status === "noshow";
    upd(booking.id, (x) => ({ ...x, status: "booked", trialDay: 9, trialTime: time, programme: prog, rebooks: wasNoShow ? x.rebooks + 1 : x.rebooks }));
    event(booking.id, `Trial ${wasNoShow ? "re-booked" : "booked"} — ${date} ${time}, ${prog}`);
    log(`Trial booked — ${booking.child}`); setBookingId(null);
  };
  const confirmEnrol = ({ date, slot, payTaken }) => {
    act(enrolling.id, `SALE 🎉 enrolled — first class ${date}, ${slot}${payTaken ? ". Rego & insurance paid" : ""}. Enter in iClassPro`, "status",
      { status: "won", soldDate: "Today", firstClass: { date, slot }, iclass: { ...enrolling.iclass, regoins: !!payTaken } });
    setEnrolId(null);
  };
  const lose = (l, reason) => { act(l.id, `Didn't enrol — ${reason}. Moved to nurture`, "status", { status: "nurture", prev: { status: l.status, trialDay: l.trialDay, attendance: l.attendance } }); setLossFor(null); };
  const tickIclass = (l, key) => upd(l.id, (x) => ({ ...x, iclass: { ...x.iclass, [key]: !x.iclass[key] } }));

  const toGo = TARGET.goal - TARGET.actual;
  const pct = Math.min(100, Math.round((TARGET.actual / TARGET.goal) * 100));

  const statusTag = (l) => l.status === "new" ? (!l.contacted ? <Tag tone="red" solid>not contacted</Tag> : <Tag tone="yellow" solid>new lead</Tag>)
    : l.status === "booked" ? <Tag tone="green">trial booked</Tag>
    : l.status === "noshow" ? <Tag tone="red">no-show</Tag>
    : l.status === "won" ? (l.iclass.verified ? <Tag tone="green" solid>sale ✓</Tag> : <Tag tone="yellow">sale — pending admin</Tag>)
    : <Tag>nurture</Tag>;

  /* step widget for trial rows: arrived near the name, sale to the right */
  const StepDot = ({ done, label }) => (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 10.5, fontWeight: 800, color: done ? C.green : C.muted, textTransform: "uppercase", letterSpacing: 0.5 }}>
      <span style={{ width: 16, height: 16, borderRadius: 99, display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 10, background: done ? C.green : C.greyBg, color: done ? "#fff" : C.muted, border: `1px solid ${done ? C.greenDark : C.line}` }}>{done ? "✓" : ""}</span>
      {label}
    </span>
  );

  const NewRow = ({ l }) => (
    <div style={{ display: "grid", gridTemplateColumns: "120px 1fr auto", gap: 10, alignItems: "center", padding: "10px 12px", borderBottom: `1px solid ${C.lineSoft}` }}>
      <div>
        <div style={{ fontSize: 12, fontWeight: 800, color: C.inkSoft }}>{l.received}</div>
        <div style={{ fontSize: 11, fontWeight: 900, color: l.waitMin > 240 ? C.red : C.yellow }}>{waitLabel(l.waitMin)} waiting</div>
      </div>
      <div>
        <WhoCell l={l} onOpen={() => setOpenId(l.id)} onOpenParent={() => setParentKey(l.phone)} />
        <div style={{ marginTop: 3, display: "flex", gap: 5 }}>
          {!l.contacted
            ? <Tag tone="red" solid>not contacted yet</Tag>
            : l.lastOutcome === "Spoke — call back later"
              ? <Tag tone="yellow">spoke — call back later</Tag>
              : <Tag tone="yellow">{l.attempts} call{l.attempts > 1 ? "s" : ""} · not reached</Tag>}
        </div>
      </div>
      <div style={{ display: "flex", gap: 6, alignItems: "center", position: "relative" }}>
        <Next onClick={() => setCallFor(callFor === l.id ? null : l.id)}>📞 Call to book</Next>
        <Quiet onClick={() => setBookingId(l.id)}>book directly</Quiet>
        {callFor === l.id && <CallMenu onPick={(o) => callOutcome(l, o)} onClose={() => setCallFor(null)} />}
      </div>
    </div>
  );

  /* trial row: time | who + arrived step | outcome (the sale) */
  const TodayRow = ({ l }) => {
    const arrivedDone = l.attendance === "arrived";
    return (
      <div style={{ display: "grid", gridTemplateColumns: "56px 1fr 170px 230px", gap: 10, alignItems: "center", padding: "10px 12px", borderBottom: `1px solid ${C.lineSoft}` }}>
        <div style={{ fontWeight: 900, fontSize: 14 }}>{l.trialTime}</div>
        <div>
          <WhoCell l={l} onOpen={() => setOpenId(l.id)} onOpenParent={() => setParentKey(l.phone)} />
          <div style={{ marginTop: 3, display: "flex", gap: 5, alignItems: "center" }}>
            {l.formBack ? <Tag tone="green">form ✓</Tag> : <><Tag tone="grey">form pending</Tag><Quiet onClick={() => act(l.id, "Jotform re-sent to parent", "comm")}>resend</Quiet><Quiet onClick={() => act(l.id, "Jotform received ✓", "status", { formBack: true })}>✓</Quiet></>}
          </div>
        </div>
        {/* step 1: arrived — sits next to the name */}
        <div>
          {arrivedDone
            ? <span onClick={() => act(l.id, "Undid: marked arrived", "status", { attendance: null })} title="Click to undo" style={{ cursor: "pointer" }}><StepDot done label="arrived" /></span>
            : <span style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
                <Quiet onClick={() => act(l.id, "Marked arrived ✓", "status", { attendance: "arrived" })}>① Arrived ✓</Quiet>
                <Quiet onClick={() => act(l.id, "Marked no-show", "status", { attendance: null, status: "noshow", trialDay: null })}>no-show</Quiet>
              </span>}
        </div>
        {/* step 2: the sale — destination on the right */}
        <div style={{ display: "flex", gap: 6, alignItems: "center", justifyContent: "flex-end" }}>
          {!arrivedDone ? (
            <span style={{ fontSize: 11, fontWeight: 800, color: C.muted, textTransform: "uppercase", letterSpacing: 0.5 }}>② outcome — after arrival</span>
          ) : lossFor === l.id ? (
            <LossPicker inp={inp} onConfirm={(reason) => lose(l, reason)} onCancel={() => setLossFor(null)} />
          ) : (
            <><Sale onClick={() => setEnrolId(l.id)}>💰 Make the sale</Sale>
              <Quiet onClick={() => setLossFor(l.id)}>didn't enrol</Quiet></>
          )}
        </div>
      </div>
    );
  };

  const NoShowRow = ({ l }) => (
    <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 10, alignItems: "center", padding: "10px 12px", borderBottom: `1px solid ${C.lineSoft}` }}>
      <div>
        <WhoCell l={l} onOpen={() => setOpenId(l.id)} onOpenParent={() => setParentKey(l.phone)} />
        <div style={{ marginTop: 3 }}><Tag tone="red">no-show — reach out & re-book</Tag></div>
      </div>
      <div style={{ display: "flex", gap: 6 }}>
        <Quiet onClick={() => act(l.id, 'Text sent — "Sorry we missed you…"', "comm")}>send text</Quiet>
        <Next onClick={() => setBookingId(l.id)}>Re-book</Next>
      </div>
    </div>
  );

  const TomorrowRow = ({ l }) => (
    <div style={{ display: "grid", gridTemplateColumns: "56px 1fr auto", gap: 10, alignItems: "center", padding: "8px 12px", borderBottom: `1px solid ${C.lineSoft}` }}>
      <div style={{ fontWeight: 900, fontSize: 13 }}>{l.trialTime}</div>
      <div>
        <WhoCell l={l} onOpen={() => setOpenId(l.id)} onOpenParent={() => setParentKey(l.phone)} />
        <div style={{ marginTop: 3, display: "flex", gap: 5, alignItems: "center" }}>
          {l.formBack ? <Tag tone="green">form ✓</Tag> : <><Tag tone="grey">form pending</Tag><Quiet onClick={() => act(l.id, "Jotform re-sent to parent", "comm")}>resend</Quiet></>}
        </div>
      </div>
      <div>
        {l.confirmed
          ? <Tag tone="green" title="Click to undo" onClick={() => act(l.id, "Undid: confirmation", "status", { confirmed: false })}>confirmed ✓</Tag>
          : <Next onClick={() => act(l.id, "Confirmation email sent", "comm", { confirmed: true })}>Send confirmation</Next>}
      </div>
    </div>
  );

  const Panel = ({ children, head, badge, sub, style }) => (
    <section style={{ background: C.card, border: `1px solid ${C.line}`, borderRadius: 6, marginBottom: 22, ...style }}>
      <div style={{ padding: "10px 14px", borderBottom: `1px solid ${C.lineSoft}`, display: "flex", gap: 10, alignItems: "center", background: "#FCFAF7" }}>
        {badge}
        <h3 style={{ margin: 0, fontSize: 12.5, fontWeight: 900, color: C.ink, textTransform: "uppercase", letterSpacing: 1.2 }}>{head}</h3>
        {sub}
      </div>
      {children}
    </section>
  );

  const Today = () => (
    <>
      <div style={{ background: C.card, border: `1px solid ${C.line}`, borderLeft: `4px solid ${C.orange}`, borderRadius: 6, padding: "14px 18px", marginBottom: 22, display: "flex", gap: 22, alignItems: "center", flexWrap: "wrap" }}>
        <div>
          <div style={{ fontSize: 10.5, fontWeight: 900, textTransform: "uppercase", letterSpacing: 1.2, color: C.muted }}>{USER.site} · {TARGET.month} target</div>
          <div style={{ fontSize: 26, fontWeight: 900, lineHeight: 1.1 }}>+{TARGET.actual} <span style={{ fontSize: 14, color: C.muted, fontWeight: 800 }}>of +{TARGET.goal} net members</span></div>
        </div>
        <div style={{ flex: 1, minWidth: 160 }}>
          <div style={{ height: 10, background: C.sand, borderRadius: 3, overflow: "hidden" }}><div style={{ width: `${pct}%`, height: "100%", background: C.orange }} /></div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontSize: 18, fontWeight: 900, color: C.orange }}>{toGo} to go</div>
          <div style={{ fontSize: 11.5, fontWeight: 800, color: C.muted }}>{OP_DAYS_LEFT} operating days left (Mon–Sat) · ≈{(toGo / OP_DAYS_LEFT).toFixed(1)} per day</div>
        </div>
      </div>

      <Panel head="New leads — call & book" badge={<Tag tone="yellow" solid>act now</Tag>}
        sub={<span style={{ fontSize: 12, fontWeight: 800, color: newLeads.length ? C.yellow : C.green }}>{newLeads.length ? `${newLeads.length} waiting` : "all booked"}</span>}>
        {newLeads.map((l) => <NewRow key={l.id} l={l} />)}
      </Panel>

      <Panel head="Today's trials — the sale happens here" badge={<Tag tone="green" solid>today</Tag>}
        sub={<span style={{ fontSize: 11.5, fontWeight: 700, color: C.muted }}>① arrived → ② outcome: 💰 sale or didn't enrol</span>}>
        {today.map((l) => <TodayRow key={l.id} l={l} />)}
        {noshows.map((l) => <NoShowRow key={l.id} l={l} />)}
      </Panel>

      {wins.length > 0 && (
        <Panel head="💰 Sales to process — enter in iClassPro" badge={<Tag tone="yellow">pending admin</Tag>}
          sub={<span style={{ fontSize: 11.5, fontWeight: 700, color: C.muted }}>tick each, then admin verifies the sale</span>}>
          {wins.map((l) => (
            <div key={l.id} style={{ padding: "10px 14px", borderBottom: `1px solid ${C.lineSoft}`, display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
              <div>
                <WhoCell l={l} onOpen={() => setOpenId(l.id)} onOpenParent={() => setParentKey(l.phone)} />
                {l.firstClass && <div style={{ fontSize: 11.5, fontWeight: 800, color: C.green, marginTop: 2 }}>first class {l.firstClass.date} · {l.firstClass.slot}</div>}
              </div>
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginLeft: "auto", alignItems: "center" }}>
                {[["class", "Class enrolled"], ["regoins", "Rego & insurance paid"], ["payment", "Payment details set up"]].map(([k, label]) => (
                  <label key={k} style={{ display: "flex", gap: 4, alignItems: "center", fontSize: 11.5, fontWeight: 800, color: C.inkSoft, cursor: "pointer" }}>
                    <input type="checkbox" checked={l.iclass[k]} onChange={() => tickIclass(l, k)} style={{ accentColor: C.green }} />{label}
                  </label>
                ))}
                {Object.entries(l.iclass).filter(([k]) => k !== "verified").every(([, v]) => v)
                  ? <Sale onClick={() => act(l.id, "Admin verified the sale ✓", "status", { iclass: { ...l.iclass, verified: true } })}>Admin: verify sale</Sale>
                  : <Tag tone="grey">finish checklist</Tag>}
              </div>
            </div>
          ))}
        </Panel>
      )}

      <Panel head="Tomorrow — confirmations & forms" sub={<span style={{ fontSize: 12, fontWeight: 800, color: C.muted }}>{tomorrow.length} booked</span>}>
        {tomorrow.map((l) => <TomorrowRow key={l.id} l={l} />)}
      </Panel>

      <button onClick={() => setWeekOpen(!weekOpen)} style={{ fontFamily: FONT, background: "transparent", border: "none", cursor: "pointer", fontSize: 12, fontWeight: 900, color: C.muted, padding: "0 0 6px", textTransform: "uppercase", letterSpacing: 0.8 }}>
        {weekOpen ? "▾" : "▸"} Later this week · {week.length} booked
      </button>
      {weekOpen && <Panel head="Later this week">{week.map((l) => <TomorrowRow key={l.id} l={l} />)}</Panel>}
    </>
  );

  const Leads = () => {
    const [filter, setFilter] = useState("All");
    const pools = { All: leads, "Received today": leads.filter((l) => l.received?.startsWith("Today")), "Not booked yet": newLeads, "No-shows": noshows, "Nurture": nurture, "Sales": leads.filter((l) => l.status === "won") };
    const list = pools[filter];
    return (
      <>
        <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginBottom: 12 }}>
          {Object.keys(pools).map((f) => (
            <button key={f} onClick={() => setFilter(f)} style={{ fontFamily: FONT, fontSize: 11.5, fontWeight: 800, cursor: "pointer", borderRadius: 4, padding: "6px 12px", border: `1px solid ${filter === f ? C.orangeDark : C.line}`, background: filter === f ? C.orange : "#fff", color: filter === f ? "#fff" : C.inkSoft }}>{f} · {pools[f].length}</button>
          ))}
        </div>
        <Panel head="Leads" sub={<span style={{ fontSize: 11.5, fontWeight: 700, color: C.muted }}>click a child's name for the full profile & timeline</span>}>
          <div style={{ display: "grid", gridTemplateColumns: "120px 1fr 170px", gap: 10, padding: "8px 12px", borderBottom: `1px solid ${C.lineSoft}` }}>
            <span style={colHead}>Received</span><span style={colHead}>Child / guardian</span><span style={colHead}>Status</span>
          </div>
          {list.map((l) => (
            <div key={l.id} style={{ display: "grid", gridTemplateColumns: "120px 1fr 170px", gap: 10, alignItems: "center", padding: "9px 12px", borderBottom: `1px solid ${C.lineSoft}` }}>
              <div style={{ fontSize: 12, fontWeight: 800, color: C.inkSoft }}>{l.received}</div>
              <WhoCell l={l} onOpen={() => setOpenId(l.id)} onOpenParent={() => setParentKey(l.phone)} />
              {statusTag(l)}
            </div>
          ))}
        </Panel>
      </>
    );
  };

  const Stats = () => {
    const wonAll = leads.filter((l) => l.status === "won");
    const salesNow = wonAll.length;
    const verified = wonAll.filter((l) => l.iclass.verified).length;
    const cards = [
      { label: "Leads this week", v: STATS.leadsWeek + leads.filter((l) => l.received?.startsWith("Today")).length - 2, tone: C.ink },
      { label: "Leads this month", v: STATS.leadsMonth, tone: C.ink },
      { label: "Trials booked · week", v: STATS.trialsBookedWeek, tone: C.ink },
      { label: "Trials booked · month", v: STATS.trialsBookedMonth, tone: C.ink },
      { label: "Trials attended · month", v: STATS.attendedMonth, tone: C.ink },
      { label: "No-shows · month", v: STATS.noShowsMonth, tone: C.red },
      { label: "Sales · month", v: salesNow, tone: C.green },
      { label: "Cancellations · month", v: STATS.cancelsMonth, tone: C.red },
    ];
    return (
      <>
        {/* HERO: net growth target vs actual */}
        <div style={{ background: C.ink, borderRadius: 6, padding: "20px 22px", marginBottom: 16, color: "#fff" }}>
          <div style={{ fontSize: 11, fontWeight: 900, textTransform: "uppercase", letterSpacing: 1.4, color: "#B9AB9C", marginBottom: 10 }}>{USER.site} · {TARGET.month} — net growth</div>
          <div style={{ display: "flex", gap: 28, alignItems: "flex-end", flexWrap: "wrap" }}>
            <div>
              <div style={{ fontSize: 44, fontWeight: 900, lineHeight: 1, color: "#7BD8A8" }}>+{TARGET.actual}</div>
              <div style={{ fontSize: 11, fontWeight: 800, color: "#B9AB9C", textTransform: "uppercase", letterSpacing: 0.8, marginTop: 4 }}>actual so far</div>
            </div>
            <div style={{ fontSize: 26, fontWeight: 900, color: "#5A5048", paddingBottom: 14 }}>vs</div>
            <div>
              <div style={{ fontSize: 44, fontWeight: 900, lineHeight: 1, color: C.orange }}>+{TARGET.goal}</div>
              <div style={{ fontSize: 11, fontWeight: 800, color: "#B9AB9C", textTransform: "uppercase", letterSpacing: 0.8, marginTop: 4 }}>target</div>
            </div>
            <div style={{ flex: 1, minWidth: 200, paddingBottom: 6 }}>
              <div style={{ height: 22, background: "#2A241D", borderRadius: 4, overflow: "hidden" }}>
                <div style={{ width: `${pct}%`, height: "100%", background: "linear-gradient(90deg, #27865C, #7BD8A8)", display: "flex", alignItems: "center", justifyContent: "flex-end", paddingRight: 8 }}>
                  <span style={{ fontSize: 11, fontWeight: 900, color: "#0F2B1D" }}>{pct}%</span>
                </div>
              </div>
              <div style={{ fontSize: 12, fontWeight: 800, color: "#F0B97B", marginTop: 6 }}>{toGo} more to hit target · {OP_DAYS_LEFT} operating days left (Mon–Sat) · ≈{(toGo / OP_DAYS_LEFT).toFixed(1)} per day</div>
            </div>
          </div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(170px, 1fr))", gap: 10, marginBottom: 16 }}>
          {cards.map((c) => (
            <div key={c.label} style={{ background: C.card, border: `1px solid ${C.line}`, borderRadius: 6, padding: "12px 16px" }}>
              <div style={{ fontSize: 26, fontWeight: 900, color: c.tone }}>{c.v}</div>
              <div style={{ fontSize: 11, fontWeight: 800, color: C.muted, textTransform: "uppercase", letterSpacing: 0.6 }}>{c.label}</div>
            </div>
          ))}
        </div>
        <Panel head={`My sales · ${TARGET.month} — breakdown`}>
          <div style={{ display: "flex", gap: 8, padding: "12px 14px", alignItems: "center", flexWrap: "wrap", borderBottom: `1px solid ${C.lineSoft}` }}>
            <span style={{ fontSize: 26, fontWeight: 900 }}>{salesNow}</span>
            <Tag tone="green">{verified} verified by admin ✓</Tag>
            {salesNow - verified > 0 && <Tag tone="yellow">{salesNow - verified} pending admin</Tag>}
            <span style={{ fontSize: 11.5, fontWeight: 700, color: C.muted }}>verified sales count toward the {TARGET.month} target & bonus</span>
          </div>
          {wonAll.map((l) => (
            <div key={l.id} style={{ display: "grid", gridTemplateColumns: "90px 1fr 150px", gap: 10, alignItems: "center", padding: "8px 14px", borderBottom: `1px solid ${C.lineSoft}` }}>
              <span style={{ fontSize: 12, fontWeight: 800, color: C.inkSoft }}>{l.soldDate || "Today"}</span>
              <span style={{ fontSize: 13, fontWeight: 800 }}>
                <button onClick={() => setOpenId(l.id)} style={{ fontFamily: FONT, fontWeight: 800, fontSize: 13, color: C.ink, background: "none", border: "none", padding: 0, cursor: "pointer", borderBottom: `1px dotted ${C.muted}` }}>{l.child}</button>
                {l.firstClass && <span style={{ fontSize: 11.5, color: C.muted, fontWeight: 700 }}> · first class {l.firstClass.slot}</span>}
              </span>
              {l.iclass.verified ? <Tag tone="green">verified ✓</Tag> : <Tag tone="yellow">pending admin</Tag>}
            </div>
          ))}
        </Panel>
      </>
    );
  };

  const Shift = () => {
    const counts = {};
    activity.forEach((a) => {
      const k = a.action.includes("Called") ? "Calls made" : a.action.includes("Trial booked") || a.action.includes("re-booked") ? "Trials booked" : a.action.includes("Confirmation") ? "Confirmations" : a.action.includes("Text") || a.action.includes("re-sent") ? "Texts / reminders" : a.action.includes("arrived") ? "Arrivals marked" : a.action.includes("SALE") ? "Sales 🎉" : a.action.includes("Cancellation") ? "Cancellations" : a.action.includes("Note") ? "Notes" : null;
      if (k) counts[k] = (counts[k] || 0) + 1;
    });
    const doneCount = checklist.filter((c) => c.done).length;
    return (
      <>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 14 }}>
          {Object.keys(counts).length === 0 && <div style={{ fontSize: 13, color: C.muted, fontWeight: 700 }}>Actions you take will tally here.</div>}
          {Object.entries(counts).map(([k, v]) => (
            <div key={k} style={{ background: C.card, border: `1px solid ${C.line}`, borderRadius: 6, padding: "10px 16px" }}>
              <div style={{ fontSize: 22, fontWeight: 900 }}>{v}</div>
              <div style={{ fontSize: 11, fontWeight: 800, color: C.muted, textTransform: "uppercase", letterSpacing: 0.6 }}>{k}</div>
            </div>
          ))}
        </div>
        <Panel head="Daily front-of-house checklist" sub={<span style={{ fontSize: 11.5, fontWeight: 800, color: doneCount === checklist.length ? C.green : C.muted }}>{doneCount}/{checklist.length} signed off</span>}>
          {checklist.map((c) => (
            <label key={c.id} style={{ display: "flex", gap: 10, alignItems: "center", padding: "9px 14px", borderBottom: `1px solid ${C.lineSoft}`, cursor: "pointer" }}>
              <input type="checkbox" checked={c.done} onChange={() => setChecklist((cs) => cs.map((x) => (x.id === c.id ? { ...x, done: !x.done } : x)))} style={{ width: 16, height: 16, accentColor: C.green }} />
              <span style={{ fontSize: 13, fontWeight: 700, color: c.done ? C.muted : C.inkSoft, textDecoration: c.done ? "line-through" : "none" }}>{c.label}</span>
              {c.done && <span style={{ fontSize: 10.5, fontWeight: 800, color: C.muted, marginLeft: "auto" }}>{USER.name} · {now()}</span>}
            </label>
          ))}
        </Panel>
        <Panel head={`Activity trail — ${USER.name}, today`}>
          {[...activity].reverse().map((a, i) => (
            <div key={i} style={{ fontSize: 12.5, fontWeight: 700, color: C.inkSoft, padding: "7px 14px", borderBottom: `1px solid ${C.lineSoft}` }}>
              <span style={{ color: C.muted, fontVariantNumeric: "tabular-nums" }}>{a.when}</span> — {a.action}
            </div>
          ))}
        </Panel>
      </>
    );
  };

  const Cancellations = () => {
    const [member, setMember] = useState(""); const [reason, setReason] = useState("Cost");
    const add = () => {
      if (!member.trim()) return;
      setCancels((c) => [...c, { id: Date.now(), member: member.trim(), noticeDate: "Today", effective: "26 June", reason, stage: 0, outcome: null }]);
      log(`Cancellation logged — ${member.trim()}`); setMember("");
    };
    const advance = (id) => setCancels((c) => c.map((x) => (x.id === id ? { ...x, stage: Math.min(x.stage + 1, 3) } : x)));
    const back = (id) => setCancels((c) => c.map((x) => (x.id === id ? { ...x, stage: Math.max(x.stage - 1, 0) } : x)));
    const saveWin = (id) => { setCancels((c) => c.map((x) => (x.id === id ? { ...x, outcome: "Saved" } : x))); log("Member saved 🎉"); };
    return (
      <>
        <Panel head="New cancellation" sub={<span style={{ fontSize: 11.5, fontWeight: 700, color: C.muted }}>two weeks' notice — the effective date is set automatically</span>}>
          <div style={{ padding: "12px 14px" }}>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <input value={member} onChange={(e) => setMember(e.target.value)} placeholder="Member name…" style={{ ...inp, flex: 1, minWidth: 170 }} />
              <select value={reason} onChange={(e) => setReason(e.target.value)} style={inp}>
                <option>Cost</option><option>Time / scheduling</option><option>Moved away</option><option>Lost interest</option><option>Changed activity</option><option>Dissatisfied</option><option>Other</option>
              </select>
              <Next onClick={add}>Log cancellation</Next>
            </div>
            <div style={{ fontSize: 11.5, color: C.muted, fontWeight: 700, marginTop: 8 }}>
              What happens next: ① parent completes the cancellation form → ② save attempt during notice → ③ processed in iClassPro → ④ admin verifies & emails confirmation.
            </div>
          </div>
        </Panel>
        <Panel head="In progress">
          {cancels.map((cx) => (
            <div key={cx.id} style={{ padding: "11px 14px", borderBottom: `1px solid ${C.lineSoft}` }}>
              <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                <div style={{ flex: 1, minWidth: 170 }}>
                  <span style={{ fontWeight: 800, fontSize: 13.5 }}>{cx.member}</span>
                  <span style={{ fontSize: 12, color: C.muted, fontWeight: 700 }}> · notice {cx.noticeDate} · effective {cx.effective} · {cx.reason}</span>
                </div>
                {cx.outcome === "Saved"
                  ? <Tag tone="green" solid>saved — staying 🎉</Tag>
                  : <>
                      {cx.stage === 0 && <Quiet onClick={() => log(`Cancellation form reminder — ${cx.member}`)}>remind: form</Quiet>}
                      {cx.stage > 0 && <Quiet onClick={() => back(cx.id)}>↩ undo step</Quiet>}
                      {cx.stage < 1 && <Quiet onClick={() => saveWin(cx.id)}>they're staying</Quiet>}
                      {cx.stage < 3 && <Next onClick={() => advance(cx.id)}>{cx.stage === 2 ? "Admin: verify + email" : `Mark "${CSTAGES[cx.stage + 1]}"`}</Next>}
                      {cx.stage === 3 && <Tag tone="green">complete ✓</Tag>}
                    </>}
              </div>
              <div style={{ display: "flex", gap: 4, marginTop: 8, flexWrap: "wrap" }}>
                {CSTAGES.map((s, i) => (
                  <div key={s} style={{ fontSize: 10.5, fontWeight: 800, color: i <= cx.stage ? C.green : C.muted, background: i <= cx.stage ? C.greenBg : C.bg, padding: "3px 8px", borderRadius: 3, border: `1px solid ${i <= cx.stage ? "#BFE0CD" : C.lineSoft}` }}>
                    {i <= cx.stage ? "✓" : i + 1} {s}{i === 3 && " (admin)"}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </Panel>
      </>
    );
  };

  return (
    <div style={{ fontFamily: FONT, background: C.bg, minHeight: "100vh", color: C.ink }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Nunito:wght@400;700;800;900&display=swap');
        *{box-sizing:border-box} button:focus-visible,input:focus-visible{outline:2px solid ${C.orange};outline-offset:2px}`}</style>

      <header style={{ background: C.ink, padding: "10px 20px", display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap", borderBottom: `3px solid ${C.orange}` }}>
        <div style={{ color: "#fff", fontWeight: 900, fontSize: 15, letterSpacing: 0.3 }}>ATHLETA <span style={{ color: C.orange }}>FRONT OF HOUSE</span></div>
        <div style={{ position: "relative", flex: 1, minWidth: 200, maxWidth: 420 }}>
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search child, parent, phone or email…"
            style={{ ...inp, width: "100%", background: "#2A241D", border: "1px solid #3A332B", color: "#fff" }} />
          {results.length > 0 && (
            <div style={{ position: "absolute", top: "110%", left: 0, right: 0, background: "#fff", borderRadius: 4, boxShadow: "0 14px 40px rgba(0,0,0,.3)", zIndex: 60, overflow: "hidden", border: `1px solid ${C.line}` }}>
              {results.slice(0, 6).map((l) => (
                <button key={l.id} onClick={() => { setOpenId(l.id); setQuery(""); }} style={{ display: "block", width: "100%", textAlign: "left", fontFamily: FONT, background: "none", border: "none", cursor: "pointer", padding: "9px 13px", borderBottom: `1px solid ${C.lineSoft}` }}>
                  <span style={{ fontWeight: 800, fontSize: 13 }}>{l.child}</span> <span style={{ fontSize: 12, color: C.muted, fontWeight: 700 }}>· {(l.rel || "").toLowerCase()} {l.parent} · {l.phone}</span>
                </button>
              ))}
            </div>
          )}
        </div>
        <div style={{ color: "#B9AB9C", fontWeight: 800, fontSize: 12 }}>{USER.name} · {USER.site}</div>
      </header>

      <nav style={{ background: "#fff", borderBottom: `1px solid ${C.line}`, padding: "0 20px", display: "flex", gap: 2, overflowX: "auto" }}>
        {["Today", "Leads", "Cancellations", "Stats", "My shift"].map((t) => (
          <button key={t} onClick={() => setTab(t)} style={{ fontFamily: FONT, fontSize: 12.5, fontWeight: 900, cursor: "pointer", padding: "11px 16px", background: "none", border: "none", color: tab === t ? C.ink : C.muted, borderBottom: tab === t ? `3px solid ${C.orange}` : "3px solid transparent", textTransform: "uppercase", letterSpacing: 0.6 }}>{t}</button>
        ))}
      </nav>

      <main style={{ padding: "18px 20px 40px", maxWidth: 1080, margin: "0 auto" }}>
        {tab === "Today" && <Today />}
        {tab === "Leads" && <Leads />}
        {tab === "Cancellations" && <Cancellations />}
        {tab === "Stats" && <Stats />}
        {tab === "My shift" && <Shift />}
      </main>

      {open && <Profile lead={open} onClose={() => setOpenId(null)} addNote={addNote} act={act} onBook={(id) => setBookingId(id)} onSale={(id) => setEnrolId(id)}
        siblings={leads.filter((l) => l.phone === open.phone && l.id !== open.id)}
        onOpenParent={() => setParentKey(open.phone)}
        onOpenChild={(id) => setOpenId(id)} />}
      {parentKey && <ParentProfile phone={parentKey} leads={leads} onClose={() => setParentKey(null)} onOpenChild={(id) => { setParentKey(null); setOpenId(id); }} />}
      {booking && <BookingModal lead={booking} onClose={() => setBookingId(null)} onConfirm={confirmBooking} />}
      {enrolling && <EnrolModal lead={enrolling} onClose={() => setEnrolId(null)} onConfirm={confirmEnrol} />}
    </div>
  );
}
