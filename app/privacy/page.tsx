import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Privacy Policy - ULink",
  description: "ULink Privacy Policy / 隐私政策",
};

export default function PrivacyPage() {
  return (
    <main className="min-h-screen bg-white px-4 py-8 text-gray-800 sm:px-6 lg:mx-auto lg:max-w-3xl lg:px-8">
      {/* English */}
      <article>
        <h1 className="text-2xl font-bold">ULink Privacy Policy</h1>
        <p className="mt-2 text-sm text-gray-500">
          Effective Date: March 5, 2026 &nbsp;|&nbsp; Last Updated: March 5,
          2026
        </p>

        <section className="mt-6 space-y-4">
          <h2 className="text-lg font-semibold">
            1. Information We Collect
          </h2>
          <p className="text-gray-700">
            To provide and improve our services, we may collect the following
            information:
          </p>
          <ul className="list-disc space-y-1 pl-6 text-gray-700">
            <li>
              <strong>Account information:</strong> email address, nickname,
              avatar, grade, major, and gender.
            </li>
            <li>
              <strong>User-generated content:</strong> posts, comments, ratings,
              partner/errand/secondhand listings you create.
            </li>
            <li>
              <strong>Private messages:</strong> text, images, and voice messages
              exchanged between users.
            </li>
            <li>
              <strong>Uploaded media:</strong> photos and audio files you upload.
            </li>
            <li>
              <strong>Device &amp; log information:</strong> IP address, device
              model, operating system, and app version (collected automatically
              for security and troubleshooting).
            </li>
          </ul>
          <p className="text-gray-700">
            We use{" "}
            <a
              href="https://www.hcaptcha.com/privacy"
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-600 underline"
            >
              hCaptcha
            </a>{" "}
            during registration to prevent automated abuse. hCaptcha may collect
            IP addresses, browser characteristics, and interaction data under its
            own privacy policy.
          </p>
        </section>

        <section className="mt-6 space-y-4">
          <h2 className="text-lg font-semibold">
            2. How We Use Your Information
          </h2>
          <ul className="list-disc space-y-1 pl-6 text-gray-700">
            <li>Provide, maintain, and improve our services.</li>
            <li>Authenticate your identity and protect account security.</li>
            <li>Process reports and enforce community guidelines.</li>
            <li>
              Send service-related notifications (e.g. verification codes,
              password resets).
            </li>
            <li>Comply with legal obligations.</li>
          </ul>
          <p className="text-gray-700">
            We do <strong>not</strong> sell your personal data to third parties.
            We do <strong>not</strong> use your data for targeted advertising.
          </p>
        </section>

        <section className="mt-6 space-y-4">
          <h2 className="text-lg font-semibold">
            3. Data Storage &amp; Cross-Border Transfer
          </h2>
          <p className="text-gray-700">
            Your data is stored on servers located in{" "}
            <strong>Hong Kong SAR and/or Singapore</strong>. If you access our
            services from outside these regions, your data may be transferred
            across borders. By using our services, you consent to such
            transfers. We take reasonable measures to ensure your data is
            protected in accordance with this policy regardless of where it is
            processed.
          </p>
        </section>

        <section className="mt-6 space-y-4">
          <h2 className="text-lg font-semibold">
            4. Data Retention &amp; Deletion
          </h2>
          <p className="text-gray-700">
            We retain your data for as long as your account is active or as
            needed to provide services. You may request a copy of your data via
            the &ldquo;Export My Data&rdquo; feature in Settings.
          </p>
          <p className="text-gray-700">
            If you delete your account, we will anonymize your personal data
            (email, name, avatar, grade, major, etc.) and remove your private
            messages, follows, blocks, and notifications within{" "}
            <strong>30 days</strong>. Public content (posts and comments) will
            be retained in de-identified form and attributed to &ldquo;Deleted
            User.&rdquo; Data required by law may be retained longer.
          </p>
        </section>

        <section className="mt-6 space-y-4">
          <h2 className="text-lg font-semibold">
            5. Data Sharing &amp; Disclosure
          </h2>
          <p className="text-gray-700">
            We may share data with service providers (cloud hosting, email
            delivery, CAPTCHA services) strictly for operating our platform.
            These providers process data only as instructed by us. We may also
            disclose data when required by law, to protect rights and safety, or
            with your explicit consent.
          </p>
        </section>

        <section className="mt-6 space-y-4">
          <h2 className="text-lg font-semibold">
            6. Local Storage &amp; Cookies
          </h2>
          <p className="text-gray-700">
            Our mobile app uses on-device storage (AsyncStorage / SecureStore)
            to save your authentication token, language preference, and app
            settings. We do not use third-party tracking cookies or advertising
            identifiers. We do not collect the Apple Identifier for Advertisers
            (IDFA).
          </p>
        </section>

        <section className="mt-6 space-y-4">
          <h2 className="text-lg font-semibold">
            7. Children&apos;s Privacy
          </h2>
          <p className="text-gray-700">
            ULink is designed for university students and is{" "}
            <strong>not intended for children under 13</strong>. We do not
            knowingly collect personal information from children under 13. If
            you believe a child under 13 has provided us with personal data,
            please contact us at the address below and we will promptly delete
            it.
          </p>
        </section>

        <section className="mt-6 space-y-4">
          <h2 className="text-lg font-semibold">
            8. Your Rights
          </h2>
          <p className="text-gray-700">
            Depending on your jurisdiction, you may have the right to:
          </p>
          <ul className="list-disc space-y-1 pl-6 text-gray-700">
            <li>Access and obtain a copy of your personal data.</li>
            <li>Correct inaccurate personal data.</li>
            <li>Delete your account and personal data.</li>
            <li>Export your data in a portable format.</li>
            <li>Withdraw consent at any time.</li>
            <li>Lodge a complaint with a data protection authority.</li>
          </ul>
          <p className="text-gray-700">
            You can exercise most of these rights through the Settings screen in
            the app. For other requests, contact us below.
          </p>
        </section>

        <section className="mt-6 space-y-4">
          <h2 className="text-lg font-semibold">
            9. Changes to This Policy
          </h2>
          <p className="text-gray-700">
            We may update this policy from time to time. Material changes will
            be communicated via in-app notification or email. Continued use of
            the service after changes constitutes acceptance of the updated
            policy.
          </p>
        </section>

        <section className="mt-6 space-y-4">
          <h2 className="text-lg font-semibold">10. Contact Us</h2>
          <p className="text-gray-700">
            If you have questions about this Privacy Policy or wish to exercise
            your data rights, please contact us at:
          </p>
          <p className="text-gray-700">
            <strong>Email:</strong>{" "}
            <a
              href="mailto:kimidavidzhang@gmail.com"
              className="text-blue-600 underline"
            >
              kimidavidzhang@gmail.com
            </a>
          </p>
        </section>
      </article>

      {/* Divider */}
      <hr className="my-12 border-gray-300" />

      {/* Chinese */}
      <article>
        <h1 className="text-2xl font-bold">ULink 隐私政策</h1>
        <p className="mt-2 text-sm text-gray-500">
          生效日期：2026 年 3 月 5 日 &nbsp;|&nbsp; 最后更新：2026 年 3 月 5 日
        </p>

        <section className="mt-6 space-y-4">
          <h2 className="text-lg font-semibold">一、我们收集的信息</h2>
          <p className="text-gray-700">
            为提供与改进服务，我们可能收集以下信息：
          </p>
          <ul className="list-disc space-y-1 pl-6 text-gray-700">
            <li>
              <strong>账号信息：</strong>邮箱、昵称、头像、年级、专业、性别。
            </li>
            <li>
              <strong>用户生成内容：</strong>
              帖子、评论、评分、搭伴/跑腿/二手发布内容。
            </li>
            <li>
              <strong>私信内容：</strong>
              用户间交换的文本、图片与语音消息。
            </li>
            <li>
              <strong>上传媒体：</strong>您上传的照片和音频文件。
            </li>
            <li>
              <strong>设备与日志信息：</strong>IP
              地址、设备型号、操作系统、应用版本（自动收集，用于安全与排错）。
            </li>
          </ul>
          <p className="text-gray-700">
            我们在注册时使用{" "}
            <a
              href="https://www.hcaptcha.com/privacy"
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-600 underline"
            >
              hCaptcha
            </a>{" "}
            防止自动化滥用。hCaptcha
            可能依据其隐私政策收集IP地址、浏览器特征和交互数据。
          </p>
        </section>

        <section className="mt-6 space-y-4">
          <h2 className="text-lg font-semibold">二、信息使用方式</h2>
          <ul className="list-disc space-y-1 pl-6 text-gray-700">
            <li>提供、维护和改进服务。</li>
            <li>验证身份并保护账号安全。</li>
            <li>处理举报并执行社区规范。</li>
            <li>发送服务相关通知（如验证码、密码重置）。</li>
            <li>遵守法律义务。</li>
          </ul>
          <p className="text-gray-700">
            我们<strong>不会</strong>将您的个人数据出售给第三方，也
            <strong>不会</strong>将数据用于定向广告。
          </p>
        </section>

        <section className="mt-6 space-y-4">
          <h2 className="text-lg font-semibold">三、数据存储与跨境传输</h2>
          <p className="text-gray-700">
            您的数据存储在位于<strong>中国香港特别行政区及/或新加坡</strong>
            的服务器上。如果您从这些地区以外访问我们的服务，您的数据可能会跨境传输。使用我们的服务即表示您同意此类传输。我们会采取合理措施，确保无论数据在何处处理，都按照本政策予以保护。
          </p>
        </section>

        <section className="mt-6 space-y-4">
          <h2 className="text-lg font-semibold">四、数据保留与删除</h2>
          <p className="text-gray-700">
            我们在您的账号处于活跃状态或提供服务需要时保留您的数据。您可通过设置中的「导出我的数据」功能获取数据副本。
          </p>
          <p className="text-gray-700">
            若您注销账号，我们将在
            <strong>30 天</strong>
            内对您的个人数据（邮箱、姓名、头像、年级、专业等）进行匿名化处理，并删除您的私信、关注、屏蔽和通知记录。公开内容（帖子和评论）将以去标识化形式保留，署名为「已注销用户」。法律法规要求保留的数据除外。
          </p>
        </section>

        <section className="mt-6 space-y-4">
          <h2 className="text-lg font-semibold">五、数据共享与披露</h2>
          <p className="text-gray-700">
            我们可能与服务提供商（云存储、邮件服务、验证码服务）共享运营平台所必需的数据，这些提供商仅按我们的指示处理数据。在法律要求、保护权利与安全，或经您明确同意时，我们也可能披露数据。
          </p>
        </section>

        <section className="mt-6 space-y-4">
          <h2 className="text-lg font-semibold">六、本地存储与 Cookie</h2>
          <p className="text-gray-700">
            我们的移动应用使用设备本地存储（AsyncStorage /
            SecureStore）保存您的认证令牌、语言偏好和应用设置。我们不使用第三方追踪
            Cookie 或广告标识符，不收集 Apple 广告标识符（IDFA）。
          </p>
        </section>

        <section className="mt-6 space-y-4">
          <h2 className="text-lg font-semibold">七、儿童隐私</h2>
          <p className="text-gray-700">
            ULink
            专为大学生设计，<strong>不面向 13 岁以下儿童</strong>
            。我们不会故意收集 13
            岁以下儿童的个人信息。如果您认为有未满 13
            岁的儿童向我们提供了个人数据，请通过以下方式联系我们，我们将及时删除。
          </p>
        </section>

        <section className="mt-6 space-y-4">
          <h2 className="text-lg font-semibold">八、您的权利</h2>
          <p className="text-gray-700">
            根据您所在司法管辖区，您可能享有以下权利：
          </p>
          <ul className="list-disc space-y-1 pl-6 text-gray-700">
            <li>访问并获取个人数据副本。</li>
            <li>更正不准确的个人数据。</li>
            <li>删除账号和个人数据。</li>
            <li>以便携格式导出数据。</li>
            <li>随时撤回同意。</li>
            <li>向数据保护机构提出投诉。</li>
          </ul>
          <p className="text-gray-700">
            上述大部分权利可通过应用内「设置」页面行使，其他请求请联系我们。
          </p>
        </section>

        <section className="mt-6 space-y-4">
          <h2 className="text-lg font-semibold">九、政策变更</h2>
          <p className="text-gray-700">
            我们可能不时更新本政策。重大变更将通过应用内通知或邮件告知。变更后继续使用服务即表示接受更新后的政策。
          </p>
        </section>

        <section className="mt-6 space-y-4">
          <h2 className="text-lg font-semibold">十、联系我们</h2>
          <p className="text-gray-700">
            如对本隐私政策有任何疑问，或希望行使您的数据权利，请联系：
          </p>
          <p className="text-gray-700">
            <strong>邮箱：</strong>
            <a
              href="mailto:kimidavidzhang@gmail.com"
              className="text-blue-600 underline"
            >
              kimidavidzhang@gmail.com
            </a>
          </p>
        </section>
      </article>
    </main>
  );
}
