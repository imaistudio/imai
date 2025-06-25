import Spline from "@splinetool/react-spline";
import Footer from "../components/footer";
import Header from "../components/header";
import { HyperText } from "@/components/magicui/hyper-text";

export default function PrivacyPolicy() {
  return (
    <>
      <Header />
      <main className="dark:bg-black dark:text-white min-h-screen flex flex-col items-center px-4">
        <section className="flex flex-col items-center max-w-5xl w-full space-y-8 py-12">
          <HyperText className="hidden lg:block">Privacy Policy</HyperText>
          <h1 className="md:hidden text-2xl md:text-4xl lg:text-4xl font-bold">
            Privacy Policy
          </h1>
          <Spline
            className="hidden lg:block"
            scene="https://prod.spline.design/1Y17xWvckyTB-D6R/scene.splinecode"
          />
          <p className="text-center dark:text-gray-300">
            imai Labs (&quot;imai,&quot; &quot;we,&quot; &quot;us,&quot; or
            &quot;our&quot;) is committed to protecting your privacy. This
            Privacy Policy explains how we collect, use, disclose, and safeguard
            your information when you use our imai platform, a generative AI
            image creation service, and our website, associated applications, or
            services (collectively, the &quot;Services&quot;). Please read this
            privacy policy carefully. If you do not agree with the terms of this
            privacy policy, please do not access the platform.
          </p>
          <h1 className="text-2xl md:text-4xl lg:text-4xl font-bold">
            1. Information We Collect
          </h1>
          <p className="text-center dark:text-gray-400">
            We may collect information about you in a variety of ways. The
            information we may collect via the Services includes:
          </p>
          <ul className="list-disc text-left dark:text-gray-400 pl-6 max-w-3xl space-y-2">
            <li>
              <strong>Personal Data:</strong> Personally identifiable
              information, such as your name, email address, and payment
              information (if you subscribe to paid services), that you
              voluntarily give to us when you register for an account or when
              you choose to participate in various activities related to the
              Services.
            </li>
            <li>
              <strong>Usage Data:</strong> Information your browser or device
              sends automatically whenever you visit our Services. This may
              include information such as your computer&apos;s Internet Protocol
              (IP) address, browser type, browser version, the pages of our
              Services that you visit, the time and date of your visit, the time
              spent on those pages, unique device identifiers, and other
              diagnostic data.
            </li>
            <li>
              <strong>Prompts and Generated Content:</strong> We collect the
              text prompts you submit to our Services and the images generated
              by our AI based on those prompts (&quot;Generated Content&quot;).
              While you retain appropriate rights to your Generated Content as
              per our Terms & Conditions, we process this data to provide and
              improve the Services.
            </li>
            <li>
              <strong>Cookies and Tracking Technologies:</strong> We may use
              cookies, beacons, tags, and scripts to collect and track
              information and to improve and analyze our Service. You can
              instruct your browser to refuse all cookies or to indicate when a
              cookie is being sent. However, if you do not accept cookies, you
              may not be able to use some portions of our Services.
            </li>
          </ul>

          <h1 className="text-2xl md:text-4xl lg:text-4xl font-bold">
            2. How We Use Your Information
          </h1>
          <p className="text-center dark:text-gray-400">
            Having accurate information about you permits us to provide you with
            a smooth, efficient, and customized experience. Specifically, we may
            use information collected about you via the Services to:
          </p>
          <ul className="list-disc text-left dark:text-gray-400 pl-6 max-w-3xl space-y-2">
            <li>Create and manage your account.</li>
            <li>
              Provide, operate, and maintain our Services, including generating
              AI images based on your prompts.
            </li>
            <li>
              Process your transactions and send you related information,
              including purchase confirmations and invoices for Paid Services.
            </li>
            <li>
              Improve, personalize, and expand our Services, including analyzing
              usage patterns and training our AI models (using anonymized and
              aggregated data where appropriate).
            </li>
            <li>
              Communicate with you, either directly or through one of our
              partners, including for customer service, to provide you with
              updates and other information relating to the Service, and for
              marketing and promotional purposes (where you have consented).
            </li>
            <li>
              Monitor and analyze usage and trends to improve your experience
              with the Services.
            </li>
            <li>
              Detect, prevent, and address technical issues and fraudulent or
              illegal activity.
            </li>
            <li>
              Comply with legal obligations and enforce our Terms and
              Conditions.
            </li>
          </ul>

          <h1 className="text-2xl md:text-4xl lg:text-4xl font-bold">
            3. How We Share Your Information
          </h1>
          <p className="text-center dark:text-gray-400">
            We may share information we have collected about you in certain
            situations. Your information may be disclosed as follows:
          </p>
          <ul className="list-disc text-left dark:text-gray-400 pl-6 max-w-3xl space-y-2">
            <li>
              <strong>By Law or to Protect Rights:</strong> If we believe the
              release of information about you is necessary to respond to legal
              process, to investigate or remedy potential violations of our
              policies, or to protect the rights, property, and safety of
              others, we may share your information as permitted or required by
              any applicable law, rule, or regulation.
            </li>
            <li>
              <strong>Third-Party Service Providers:</strong> We may share your
              information with third-party vendors, service providers,
              contractors, or agents who perform services for us or on our
              behalf and require access to such information to do that work
              (e.g., payment processing, data analysis, email delivery, hosting
              services, customer service, and AI model infrastructure).
            </li>
            <li>
              <strong>Business Transfers:</strong> We may share or transfer your
              information in connection with, or during negotiations of, any
              merger, sale of company assets, financing, or acquisition of all
              or a portion of our business to another company.
            </li>
            <li>
              <strong>With Your Consent:</strong> We may disclose your personal
              information for any other purpose with your consent.
            </li>
            <li>
              <strong>Aggregated or Anonymized Data:</strong> We may share
              aggregated or anonymized information that does not directly
              identify you with third parties for research, marketing,
              analytics, and other purposes.
            </li>
          </ul>
          <p className="text-center dark:text-gray-400">
            We do not sell your personal information to third parties for their
            marketing purposes without your explicit consent.
          </p>

          <h1 className="text-2xl md:text-4xl lg:text-4xl font-bold">
            4. Data Security
          </h1>
          <p className="text-center dark:text-gray-400">
            We use administrative, technical, and physical security measures to
            help protect your personal information. While we have taken
            reasonable steps to secure the personal information you provide to
            us, please be aware that despite our efforts, no security measures
            are perfect or impenetrable, and no method of data transmission can
            be guaranteed against any interception or other type of misuse. Any
            information disclosed online is vulnerable to interception and
            misuse by unauthorized parties. Therefore, we cannot guarantee
            complete security if you provide personal information.
          </p>

          <h1 className="text-2xl md:text-4xl lg:text-4xl font-bold">
            5. Your Data Protection Rights
          </h1>
          <p className="text-center dark:text-gray-400">
            Depending on your location, you may have the following rights
            regarding your personal information:
          </p>
          <ul className="list-disc text-left dark:text-gray-400 pl-6 max-w-3xl space-y-2">
            <li>
              The right to access – You have the right to request copies of your
              personal data.
            </li>
            <li>
              The right to rectification – You have the right to request that we
              correct any information you believe is inaccurate or complete
              information you believe is incomplete.
            </li>
            <li>
              The right to erasure – You have the right to request that we erase
              your personal data, under certain conditions.
            </li>
            <li>
              The right to restrict processing – You have the right to request
              that we restrict the processing of your personal data, under
              certain conditions.
            </li>
            <li>
              The right to object to processing – You have the right to object
              to our processing of your personal data, under certain conditions.
            </li>
            <li>
              The right to data portability – You have the right to request that
              we transfer the data that we have collected to another
              organization, or directly to you, under certain conditions.
            </li>
          </ul>
          <p className="text-center dark:text-gray-400">
            If you would like to exercise any of these rights, please contact us
            using the contact information below.
          </p>

          <h1 className="text-2xl md:text-4xl lg:text-4xl font-bold">
            6. Children&apos;s Privacy
          </h1>
          <p className="text-center dark:text-gray-400">
            Our Services are not intended for use by children under the age of
            13 (or a higher minimum age in the jurisdiction where the user
            resides). We do not knowingly collect personally identifiable
            information from children under 13. If we become aware that we have
            collected personal information from a child under 13 without
            verification of parental consent, we take steps to remove that
            information from our servers. If you are a parent or guardian and
            you are aware that your child has provided us with Personal Data,
            please contact us.
          </p>

          <h1 className="text-2xl md:text-4xl lg:text-4xl font-bold">
            7. International Data Transfers
          </h1>
          <p className="text-center dark:text-gray-400">
            Your information, including Personal Data, may be transferred to —
            and maintained on — computers located outside of your state,
            province, country, or other governmental jurisdiction where the data
            protection laws may differ from those of your jurisdiction. If you
            are located outside the jurisdiction where imai Labs is registered
            and choose to provide information to us, please note that we
            transfer the data, including Personal Data, to that jurisdiction and
            process it there. Your consent to this Privacy Policy followed by
            your submission of such information represents your agreement to
            that transfer.
          </p>

          <h1 className="text-2xl md:text-4xl lg:text-4xl font-bold">
            8. Changes to This Privacy Policy
          </h1>
          <p className="text-center dark:text-gray-400">
            We may update our Privacy Policy from time to time. We will notify
            you of any changes by posting the new Privacy Policy on this page
            and updating the &quot;Last Updated&quot; date at the top of this
            Privacy Policy. You are advised to review this Privacy Policy
            periodically for any changes. Changes to this Privacy Policy are
            effective when they are posted on this page. Your continued use of
            the Services after we post any modifications to the Privacy Policy
            on this page will constitute your acknowledgment of the
            modifications and your consent to abide and be bound by the modified
            Privacy Policy.
          </p>

          <h1 className="text-2xl md:text-4xl lg:text-4xl font-bold">
            9. Contact Us
          </h1>
          <p className="text-center dark:text-gray-400">
            If you have any questions or concerns about this Privacy Policy or
            our data practices, please contact us at:
          </p>
          <p className="text-center dark:text-gray-400">
            Email: support@imai.ai
          </p>
        </section>
      </main>
      <Footer />
    </>
  );
}
