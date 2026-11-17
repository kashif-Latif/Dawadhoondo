import Modal from "./Modal";
import { Icon } from "./ui";

const UPDATED = "17 November 2026";

const SECTIONS = [
  {
    icon: "pill",
    title: "1. What DawaDhoondo is",
    body: [
      "DawaDhoondo helps you find medicines registered with the Drug Regulatory Authority of Pakistan (DRAP), compare prices and see which nearby pharmacy has them.",
      "Medicine names and maximum retail prices come from the DRAP Pharmaceutical Price Index. Pharmacy locations, stock and courier fees in this version are demonstration data.",
    ],
  },
  {
    icon: "shield",
    title: "2. Not medical advice",
    body: [
      "DawaDhoondo does not diagnose, prescribe or give dosage advice. Always follow your doctor's or pharmacist's instructions.",
      "\"Same formula\" alternatives contain the same active ingredients, but strength, form or inactive ingredients can differ. Ask your doctor or pharmacist before switching.",
      "In an emergency call 1122 or go to the nearest hospital emergency department. Do not wait for an online order.",
    ],
  },
  {
    icon: "sparkle",
    title: "3. The AI assistant",
    body: [
      "The assistant only answers questions about medicines in our database: availability near you, prices, same-formula alternatives, and ordering or tracking on DawaDhoondo. Other questions are declined.",
      "Its answers are generated only from our database and can still be incomplete or wrong. Check details on the medicine card before you buy.",
      "Attempts to misuse the assistant (prompt injection, SQL injection, extracting system details or keys, automated scraping) are blocked, rate-limited and logged by IP address.",
    ],
  },
  {
    icon: "lock",
    title: "4. Prescription and controlled medicines",
    body: [
      "Medicines marked Rx need a valid prescription. Keep it ready for the rider or at pickup. The pharmacy may refuse to hand over the medicine without one.",
      "Controlled medicines (for example strong painkillers and sedatives) cannot be ordered through DawaDhoondo. They can only be bought in person at a pharmacy with a valid prescription.",
    ],
  },
  {
    icon: "receipt",
    title: "5. Orders",
    body: [
      "Orders are requests to the pharmacy, paid cash on delivery or at pickup. The pharmacy confirms, prepares and delivers, and may cancel if the medicine is unavailable.",
      "Delivery times and courier fees are estimates. Prices may change; the pharmacy's price at confirmation applies and will not exceed the DRAP maximum retail price.",
    ],
  },
  {
    icon: "mail",
    title: "6. Your data and privacy",
    body: [
      "When you order we store your name, phone, email and address, and share them only with the pharmacy handling your order, so it can be fulfilled and you can be notified by email.",
      "Your location is used in your browser to sort pharmacies by distance and is sent only with your search. Voice input is converted to text by your browser.",
      "Questions to the assistant are processed by an AI provider (Groq or Google Gemini). Uploaded prescription photos and PDFs are sent to Google Gemini to read medicine names and are not stored by DawaDhoondo. Don't include other people's personal details.",
      "Your contact details are remembered on your own device to speed up the next order; clear your browser data to remove them.",
    ],
  },
  {
    icon: "close",
    title: "7. Acceptable use",
    body: [
      "Don't use DawaDhoondo to obtain medicines without a valid prescription where one is required, to place fake orders, or to attack, overload or scrape the service.",
      "We may block access for misuse. Use of the service means you accept these terms.",
    ],
  },
];

export default function Terms({ onClose }) {
  return (
    <Modal title="Terms of Use & Privacy" subtitle={`Last updated ${UPDATED}`} onClose={onClose}
      footer={<button onClick={onClose} className="btn-primary w-full rounded-xl py-3 text-sm">I understand</button>}>
      <div className="space-y-4 pt-1">
        {SECTIONS.map((s) => (
          <section key={s.title}>
            <h3 className="mb-1.5 flex items-center gap-2 text-[14px] font-bold">
              <span className="grid h-7 w-7 place-items-center rounded-lg bg-brand-500/10 text-brand-700"><Icon name={s.icon} className="h-4 w-4" /></span>
              {s.title}
            </h3>
            <ul className="space-y-1.5 pl-9 text-[13px] leading-relaxed text-slate-600">
              {s.body.map((b, i) => <li key={i} className="list-disc">{b}</li>)}
            </ul>
          </section>
        ))}
        <p className="rounded-xl bg-slate-900/5 p-3 text-[12px] text-slate-500">
          Hackathon prototype built for the STCS AI Hackathon, Minhaj University Lahore. Not a licensed pharmacy.
        </p>
      </div>
    </Modal>
  );
}
