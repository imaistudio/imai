
import Spline from '@splinetool/react-spline';
import Footer from '../components/footer';
import Header from '../components/header';
import { HyperText } from "@/components/magicui/hyper-text";

export default function TermsAndConditions() {
  return (
    <>
      <Header />
      <main className="bg-white text-black dark:bg-black  dark:text-white min-h-screen flex flex-col items-center px-4">
      <section className="flex flex-col items-center max-w-5xl w-full space-y-8 py-12">
      <HyperText className='hidden lg:block'>Terms & Conditions</HyperText>
      <h1 className='md:hidden text-2xl md:text-4xl lg:text-4xl font-bold'>Terms & Condition</h1>

      <p className="text-center dark:text-gray-300">
        These Terms and Conditions, hereinafter referred to as the &quot;Terms,&quot; constitute a legally binding agreement that governs your access to and comprehensive use of the imai platform. The imai platform, a generative AI image creation service, is provided by imai Labs. It is crucial that you understand that by accessing, browsing, or utilizing any component of our website, associated applications, or services (collectively, the &quot;Services&quot;), you explicitly acknowledge that you have read, understood, and agree to be bound by the entirety of these Terms. If you do not agree with any part of these Terms, or if you are unwilling to be bound by them, you must immediately cease and refrain from all use of our platform and Services.
      </p>

      <h1 className='text-2xl md:text-4xl lg:text-4xl font-bold'>1. Use of Our Services</h1>
      <p className="text-center dark:text-gray-400">
        imai hereby grants you a personal, non-exclusive, non-transferable, and revocable limited right to access and utilize the platform strictly for its intended purpose: the creation of AI-generated images, subject always to your full compliance with these Terms. This license is for your individual use or internal business purposes, as applicable. It is strictly prohibited to employ the imai platform for creating, uploading, sharing, or distributing any content that is, or could reasonably be considered, harmful, threatening, abusive, harassing, unlawful, infringing upon the rights of others (including intellectual property rights), defamatory, libelous, obscene, pornographic, invasive of another&apos;s privacy, or otherwise objectionable in any manner. We reserve the right to determine, in our sole discretion, what constitutes such objectionable content.
      </p>

      <p className="text-center dark:text-gray-400">
        To access and use the imai platform, you must be at least 13 years of age, or the minimum age required in your jurisdiction to consent to use online services. If you are under the age of 18, or the age of legal majority in your jurisdiction, you affirm that you have obtained parental or legal guardian consent to use the platform and to agree to these Terms. Furthermore, if you are utilizing the platform on behalf of an organization, company, or other legal entity, you represent and warrant that you possess the full legal authority to bind that entity to these Terms, and your agreement to these Terms will be treated as the agreement of the entity. In such a case, &quot;you&quot; and &quot;your&quot; will refer to that entity.
      </p>

      <h1 className='text-2xl md:text-4xl lg:text-4xl font-bold'>2. Account Registration</h1>
      <p className="text-center dark:text-gray-400">
        Access to certain advanced features or functionalities of the imai platform may necessitate that you register for an account. Should you choose to register, you unequivocally agree to provide information that is accurate, complete, and current at the time of registration, and to diligently update such information as necessary to maintain its accuracy and completeness. You are also responsible for safeguarding your login credentials, including your username and password, and must not disclose them to any third party. You acknowledge and agree that you are solely and fully responsible for any and all activities, actions, or omissions that occur under your account, whether or not authorized by you. You must notify imai immediately upon becoming aware of any unauthorized use of your account or any other breach of security.
      </p>

      <h1 className='text-2xl md:text-4xl lg:text-4xl font-bold'>3. AI-Generated Content</h1>
      <p className="text-center dark:text-gray-400">
        While the specific images you successfully generate using the imai platform (&quot;Generated Content&quot;) are considered your creations to use in accordance with these Terms and applicable law, it is crucial to understand that the underlying AI models, algorithms, software, and the platform itself remain the exclusive intellectual property of imai or its licensors. imai does not assert ownership over your unique prompts or the specific Generated Content you create. However, by using our Services, you grant imai a worldwide, non-exclusive, royalty-free license to use anonymous, aggregated data derived from your usage and Generated Content (without any personally identifiable information) for the purposes of research, platform improvement, development of new features, and service optimization.
      </p>

      <p className="text-center dark:text-gray-400">
        You bear the sole and complete responsibility for the Generated Content you create and any consequences arising from its use or distribution. This includes, but is not limited to, ensuring that your prompts and the resulting Generated Content do not infringe upon the intellectual property rights (such as copyrights, trademarks, patents, or trade secrets) of any third party, nor violate any applicable laws, regulations, or our community guidelines (which are incorporated herein by reference). You agree to indemnify and hold imai harmless from any claims arising out of your Generated Content or your use thereof.
      </p>

      <h1 className='text-2xl md:text-4xl lg:text-4xl font-bold'>4. Prohibited Uses</h1>
      <p className="text-center dark:text-gray-400">
        The imai platform is intended for creative and lawful purposes, and its misuse can have serious consequences. Therefore, you explicitly agree not to use the imai platform for any of the activities listed below, or any other activity that we, in our sole discretion, deem inappropriate, harmful, or contrary to the spirit of our service. Engaging in prohibited uses may result in immediate suspension or termination of your access to the Services, and potentially legal action.
      </p>
      <ul className="list-disc text-left dark:text-gray-400 pl-6 max-w-3xl">
        <li>Generate content that is hateful, discriminatory, excessively violent, promotes self-harm, or depicts illegal activities or substances.</li>
        <li>Create or distribute content that infringes on any third party&apos;s copyright, trademark, patent, trade secret, or other proprietary rights.</li>
        <li>Engage in activities such as spamming, sending unsolicited communications, or imposing an unreasonable or disproportionately large load on our infrastructure or services.</li>
        <li>Attempt to decompile, disassemble, reverse-engineer, or otherwise derive the source code or underlying algorithms or model data of the imai platform.</li>
      </ul>

      <h1 className='text-2xl md:text-4xl lg:text-4xl font-bold'>5. Intellectual Property</h1>
      <p className="text-center dark:text-gray-400">
        All rights, title, and interest in and to the imai platform – including but not limited to its software, algorithms, AI models, source code, object code, website designs, user interface, text, graphics, logos, icons, images, audio clips, video clips, data compilations, and brand elements (collectively, &quot;imai IP&quot;) – are and will remain the exclusive property of imai Labs and its licensors. The imai IP is protected by copyright, trademark, patent, trade secret, and other intellectual property laws of applicable jurisdictions. These Terms do not grant you any rights to use imai&apos;s trademarks, logos, domain names, or other distinctive brand features without our prior written consent.
      </p>

      <h1 className='text-2xl md:text-4xl lg:text-4xl font-bold'>6. Payment and Subscription</h1>
      <p className="text-center dark:text-gray-400">
        Access to certain premium features, enhanced functionalities, or higher usage tiers of the imai platform may be subject to payment of fees, either on a one-time basis or through a recurring subscription (&ldquo;Paid Services&ldquo;). By selecting a Paid Service, you agree to pay imai the applicable fees and any taxes. All fees are quoted in a specific currency and are non-refundable, except where explicitly stated otherwise by imai or as mandatorily required by applicable law. imai reserves the right to change its pricing, payment terms, and the availability of features at any time, and will provide reasonable notice of such changes, which may be communicated via email or by posting on our website. Failure to pay applicable fees may result in suspension or termination of your access to Paid Services.
      </p>

      <h1 className='text-2xl md:text-4xl lg:text-4xl font-bold'>7. Disclaimer of Warranties</h1>
      <p className="text-center dark:text-gray-400">
        The imai platform and all its services are provided on an &quot;as is&quot; and &quot;as available&quot; basis, without any warranties of any kind, either express or implied. To the fullest extent permissible under applicable law, imai, its affiliates, and its licensors expressly disclaim all warranties, including, but not limited to, implied warranties of merchantability, fitness for a particular purpose, title, non-infringement, and any warranties arising out of course of dealing or usage of trade. We do not warrant that the platform will be uninterrupted, secure, error-free, free of viruses or other harmful components, or that defects will be corrected. Furthermore, we do not guarantee the accuracy, completeness, reliability, or quality of any content, including AI-generated images, or that the platform will meet your specific requirements or expectations. You acknowledge that generative AI is an evolving field and outputs may sometimes be unexpected, inaccurate, or reflect biases present in the training data.
      </p>

      <h1 className='text-2xl md:text-4xl lg:text-4xl font-bold'>8. Limitation of Liability</h1>
      <p className="text-center dark:text-gray-400">
        To the fullest extent permitted by applicable law, in no event shall imai, its affiliates, directors, employees, agents, suppliers, or licensors be liable for any indirect, incidental, special, consequential, exemplary, or punitive damages. This includes, but is not limited to, damages for loss of profits, revenue, data, goodwill, or other intangible losses, arising out of or relating to your access to or use of, or inability to access or use, the imai platform or any content or services thereon. This limitation applies whether the alleged liability is based on contract, tort (including negligence), strict liability, or any other legal theory, even if imai has been advised of the possibility of such damage, and even if a remedy set forth herein is found to have failed of its essential purpose. In jurisdictions that do not allow the exclusion or limitation of certain damages, our liability shall be limited to the maximum extent permitted by law.
      </p>

      <h1 className='text-2xl md:text-4xl lg:text-4xl font-bold'>9. Termination</h1>
      <p className="text-center dark:text-gray-400">
        imai reserves the right, in its sole discretion, to suspend, restrict, or terminate your access to all or any part of the platform at any time, with or without prior notice or liability, for any reason or no reason, including, without limitation, if we reasonably believe that you have violated or acted inconsistently with the letter or spirit of these Terms. You acknowledge that any such termination may be effected without prior notice, and you agree that imai will not be liable to you or any third party for any termination of your access. You may also choose to discontinue your use of the platform and terminate your account (if applicable) at any time by following the instructions on the platform or contacting support. Upon termination, your right to use the Services will immediately cease. Provisions of these Terms that by their nature should survive termination shall survive, including, without limitation, ownership provisions, warranty disclaimers, indemnity, and limitations of liability.
      </p>

      <h1 className='text-2xl md:text-4xl lg:text-4xl font-bold'>10. Governing Law</h1>
      <p className="text-center dark:text-gray-400">
        These Terms and any action related thereto will be governed by and construed in accordance with the laws of the jurisdiction in which imai Labs is officially registered and primarily operates, without regard to its conflict of law provisions or principles that would cause the application of the laws of another jurisdiction. You expressly agree that the exclusive jurisdiction and venue for any claim or dispute you may have with imai, or which in any way relates to your use of the platform, shall be in the competent local, state, or federal courts located within that specified jurisdiction, and you further agree and submit to the personal jurisdiction of such courts for the purpose of litigating any such claim or action.
      </p>

      <h1 className='text-2xl md:text-4xl lg:text-4xl font-bold'>11. Changes to Terms</h1>
      <p className="text-center dark:text-gray-400">
        imai reserves the right, at our sole discretion, to modify, amend, or replace these Terms at any time. We will endeavor to provide reasonable notice of any material changes, which may include posting the updated Terms on this page with a revised &quot;Last Updated&quot; date, or by other means such as email notification if you have an account with us. It is your responsibility to review these Terms periodically for any changes. Your continued access to or use of the imai platform after any such modifications become effective shall constitute your conclusive acceptance of, and agreement to be bound by, the revised Terms. If you do not agree to the new terms, you must stop using the Services.
      </p>

      <h1 className='text-2xl md:text-4xl lg:text-4xl font-bold'>12. Contact Us</h1>
      <p className="text-center dark:text-gray-400">
        Should you have any questions, concerns, comments, or require clarification regarding these Terms and Conditions, or any aspect of our Services, please do not hesitate to contact us. You can reach our support team via email at support@imai.ai, or alternatively, by utilizing the designated contact form available on our website. We encourage you to communicate any inquiries to ensure a clear understanding of your rights and obligations under this agreement.
      </p>
    </section >
       <Spline className='hidden dark:lg:flex' scene="https://prod.spline.design/nufXpbxU7UzpYDQk/scene.splinecode" />
      </main>
      <Footer />
    </>
  );
}
