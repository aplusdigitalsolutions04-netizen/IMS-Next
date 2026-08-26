import Link from "next/link";

export const metadata = {
  title: "Terms of Service | IMS-APDS",
  description: "Terms of Service for A Plus Digital Solutions Inventory Management System",
};

const SECTIONS = [
  {
    title: "1. Acceptance of Terms",
    body: `These Terms of Service ("Terms") govern your access to and use of the Inventory Management System ("IMS", "the Platform") operated by A Plus Digital Solutions ("we", "us", "our"). By accessing or using the Platform, you agree to be bound by these Terms. If you do not agree, you must not use the Platform.`,
  },
  {
    title: "2. Eligibility and Accounts",
    body: `Access to the Platform is provided to authorized personnel of organizations that have engaged A Plus Digital Solutions. Accounts are created by an administrator and issued to individual users.`,
    list: [
      "You are responsible for maintaining the confidentiality of your login credentials.",
      "You must not share your account with another person or allow unauthorized access.",
      "You must notify your administrator immediately if you suspect unauthorized use of your account.",
      "Access levels and permissions are assigned based on your role and may be modified or revoked at any time by your organization's administrator.",
    ],
  },
  {
    title: "3. Acceptable Use",
    body: `You agree to use the Platform only for lawful, internal business purposes related to inventory, order, dispatch, and contract management. You must not:`,
    list: [
      "Attempt to gain unauthorized access to any part of the Platform, other accounts, or connected systems.",
      "Upload or enter data that is unlawful, fraudulent, or infringes the rights of any third party.",
      "Interfere with or disrupt the integrity or performance of the Platform, including through reverse engineering, scraping, or automated abuse.",
      "Use the Platform to store or transmit malicious code.",
    ],
  },
  {
    title: "4. Your Data",
    body: `You (and your organization) retain ownership of all inventory, order, contract, and other business data entered into the Platform ("Customer Data"). We process Customer Data solely to provide and support the Platform's functionality, as described in our [Privacy Policy](/privacy-policy). You are responsible for the accuracy and legality of the data you enter.`,
  },
  {
    title: "5. Third-Party Integrations",
    body: `The Platform may integrate with third-party services, such as Google Drive, to enable optional features like file syncing and document export. Your use of any such integration is also subject to the applicable third party's own terms and privacy policy. We are not responsible for the availability or performance of third-party services.`,
  },
  {
    title: "6. Availability and Changes",
    body: `We aim to keep the Platform available and reliable but do not guarantee uninterrupted or error-free operation. We may modify, suspend, or discontinue any feature of the Platform at any time, including for maintenance, upgrades, or security reasons, with reasonable notice where practical.`,
  },
  {
    title: "7. Intellectual Property",
    body: `The Platform, including its software, design, and underlying technology, is owned by A Plus Digital Solutions and protected by applicable intellectual property laws. These Terms do not grant you any rights to our trademarks, branding, or source code beyond what is necessary to use the Platform as intended.`,
  },
  {
    title: "8. Termination",
    body: `We or your organization's administrator may suspend or terminate your access to the Platform at any time, including for violation of these Terms, security concerns, or at the end of your organization's engagement with us. Upon termination, your right to access the Platform ends immediately; certain data retention obligations described in our Privacy Policy may continue to apply.`,
  },
  {
    title: "9. Disclaimer and Limitation of Liability",
    body: `The Platform is provided "as is" and "as available" without warranties of any kind, express or implied. To the fullest extent permitted by law, A Plus Digital Solutions shall not be liable for any indirect, incidental, special, or consequential damages arising from your use of, or inability to use, the Platform.`,
  },
  {
    title: "10. Changes to These Terms",
    body: `We may update these Terms from time to time. Changes will be posted on this page with an updated revision date. Continued use of the Platform after changes are posted constitutes acceptance of the revised Terms.`,
  },
  {
    title: "11. Contact Us",
    body: `If you have questions about these Terms, please contact us at rahul.aplusdigitalsolutions@gmail.com.`,
  },
];

export default function TermsOfServicePage() {
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
            Terms of Service
          </h1>
          <p className="text-slate-500 text-sm font-medium mb-10">
            Last updated: August 26, 2026
          </p>

          <div className="space-y-8">
            {SECTIONS.map((section) => (
              <section key={section.title}>
                <h2 className="text-lg font-bold text-slate-800 mb-2">{section.title}</h2>
                <p className="text-slate-600 leading-relaxed text-sm">
                  {section.title === "4. Your Data" ? (
                    <>
                      You (and your organization) retain ownership of all inventory, order, contract, and other
                      business data entered into the Platform (&quot;Customer Data&quot;). We process Customer Data
                      solely to provide and support the Platform&apos;s functionality, as described in our{" "}
                      <Link href="/privacy-policy" className="text-emerald-600 font-bold hover:underline">
                        Privacy Policy
                      </Link>
                      . You are responsible for the accuracy and legality of the data you enter.
                    </>
                  ) : (
                    section.body
                  )}
                </p>
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
