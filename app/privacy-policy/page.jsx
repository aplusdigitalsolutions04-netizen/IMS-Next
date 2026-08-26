import Link from "next/link";

export const metadata = {
  title: "Privacy Policy | IMS-APDS",
  description: "Privacy Policy for A Plus Digital Solutions Inventory Management System",
};

const SECTIONS = [
  {
    title: "1. Introduction",
    body: `A Plus Digital Solutions ("we", "us", "our") operates the Inventory Management System ("IMS", "the Platform"). This Privacy Policy explains what information we collect through the Platform, how we use it, and the choices you have. By using the Platform, you agree to the collection and use of information in accordance with this policy.`,
  },
  {
    title: "2. Information We Collect",
    body: `We collect information necessary to operate the Platform, including:`,
    list: [
      "Account information such as your name, email address, username, and role, provided when your administrator creates your account.",
      "Operational data you enter or upload, such as inventory records, orders, dispatches, contracts, returns, and related business documents.",
      "Files you connect or export via integrated third-party services (for example, Google Drive), limited to what is required for the specific feature you use.",
      "Usage information such as login timestamps and actions taken within the Platform, used for audit and security purposes.",
    ],
  },
  {
    title: "3. How We Use Your Information",
    body: `We use the information we collect to:`,
    list: [
      "Provide, operate, and maintain the core functionality of the Platform.",
      "Authenticate users and enforce role-based access control.",
      "Generate reports, track stock, and manage orders, dispatches, and returns on your organization's behalf.",
      "Maintain the security and integrity of the Platform, including detecting and preventing unauthorized access.",
      "Communicate with you about your account or the Platform when necessary.",
    ],
  },
  {
    title: "4. Google Drive Integration",
    body: `If your organization enables the Google Drive integration, the Platform requests access to your Google account solely to read, write, or organize files you explicitly choose to sync or export (such as reports or warranty certificates). We do not access any other files in your Google Drive, and we do not share your Google account data with third parties. You may revoke this access at any time from your Google Account permissions or from the Platform's settings.`,
  },
  {
    title: "5. Data Sharing",
    body: `We do not sell your personal information. We do not share information with third parties except:`,
    list: [
      "With service providers who help us operate the Platform (for example, hosting or storage providers), under obligations of confidentiality.",
      "When required by law, regulation, or valid legal process.",
      "With your organization's authorized administrators, as part of normal Platform operation.",
    ],
  },
  {
    title: "6. Data Retention",
    body: `We retain account and operational data for as long as your organization's account remains active, or as needed to comply with legal obligations, resolve disputes, and enforce our agreements. Data may be deleted or anonymized upon request, subject to any legal retention requirements.`,
  },
  {
    title: "7. Data Security",
    body: `We implement reasonable technical and organizational measures, including role-based access control and authenticated sessions, to protect your information from unauthorized access, alteration, disclosure, or destruction. No method of transmission or storage is completely secure, and we cannot guarantee absolute security.`,
  },
  {
    title: "8. Your Rights",
    body: `Depending on your role and applicable law, you may have the right to access, correct, or request deletion of your personal information. To exercise these rights, please contact your organization's system administrator or reach out to us using the details below.`,
  },
  {
    title: "9. Changes to This Policy",
    body: `We may update this Privacy Policy from time to time. Changes will be posted on this page with an updated revision date. Continued use of the Platform after changes are posted constitutes acceptance of the revised policy.`,
  },
  {
    title: "10. Contact Us",
    body: `If you have questions about this Privacy Policy or how your data is handled, please contact us at rahul.aplusdigitalsolutions@gmail.com.`,
  },
];

export default function PrivacyPolicyPage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-[#f4f7f6] via-[#e2e8f0] to-[#cbd5e1] font-sans">
      <div className="w-full px-4 sm:px-10 lg:px-20 py-16">
        <div className="mb-8">
          <Link href="/login" className="text-xs font-bold text-emerald-600 hover:text-emerald-700 uppercase tracking-widest">
            ← Back to Home
          </Link>
        </div>

        <div className="w-full bg-white/90 backdrop-blur-md rounded-3xl shadow-[0_20px_50px_rgba(0,0,0,0.1)] border border-white/50 p-8 sm:p-12">
          <div className="flex items-center gap-2 mb-2">
            <span className="h-[1px] w-8 bg-emerald-500"></span>
            <h5 className="text-emerald-550 text-xs font-black tracking-[0.3em] uppercase">
              Inventory Management Digital Portal
            </h5>
          </div>
          <h1 className="text-3xl sm:text-4xl font-black text-slate-800 tracking-tight mb-2">
            Privacy Policy
          </h1>
          <p className="text-slate-500 text-sm font-medium mb-10">
            Last updated: August 26, 2026
          </p>

          <div className="space-y-8">
            {SECTIONS.map((section) => (
              <section key={section.title}>
                <h2 className="text-lg font-bold text-slate-800 mb-2">{section.title}</h2>
                <p className="text-slate-600 leading-relaxed text-sm">{section.body}</p>
                {section.list && (
                  <ul className="mt-3 space-y-2">
                    {section.list.map((item) => (
                      <li key={item} className="flex gap-2 text-sm text-slate-600 leading-relaxed">
                        <span className="text-emerald-500 mt-0.5">✔</span>
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            ))}
          </div>
        </div>

        <div className="mt-8 text-center">
          <p className="text-[10px] text-slate-400 font-bold tracking-[0.2em] uppercase">
            © {new Date().getFullYear()} A PLUS DIGITAL SOLUTIONS
          </p>
        </div>
      </div>
    </div>
  );
}
