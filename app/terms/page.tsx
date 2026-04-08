import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Terms of Service - ULink",
  description: "ULink Terms of Service / 用户协议（服务条款）",
};

export default function TermsPage() {
  return (
    <main className="min-h-screen bg-white px-4 py-8 text-gray-800 sm:px-6 lg:mx-auto lg:max-w-3xl lg:px-8">
      {/* English */}
      <article>
        <h1 className="text-2xl font-bold">ULink Terms of Service</h1>
        <p className="mt-2 text-sm text-gray-500">
          Effective Date: March 5, 2026 &nbsp;|&nbsp; Last Updated: March 5,
          2026
        </p>

        <section className="mt-6 space-y-4">
          <h2 className="text-lg font-semibold">1. About the Service</h2>
          <p className="text-gray-700">
            ULink is a community platform designed for university students. By
            using our service, you agree to these Terms. We reserve the right to
            modify these Terms; material changes will be communicated via in-app
            notification or email.
          </p>
        </section>

        <section className="mt-6 space-y-4">
          <h2 className="text-lg font-semibold">2. Eligibility</h2>
          <p className="text-gray-700">
            You must be at least <strong>13 years old</strong> to use ULink. The
            service is intended for university students. By creating an account,
            you represent that you meet these requirements.
          </p>
        </section>

        <section className="mt-6 space-y-4">
          <h2 className="text-lg font-semibold">
            3. Account &amp; Community Guidelines
          </h2>
          <p className="text-gray-700">
            You must provide accurate registration information and are
            responsible for safeguarding your account credentials. You agree to:
          </p>
          <ul className="list-disc space-y-1 pl-6 text-gray-700">
            <li>Follow community guidelines and use the anonymous feature responsibly.</li>
            <li>
              Not post illegal, infringing, harassing, abusive, or false
              content.
            </li>
            <li>Not impersonate others or disrupt the service.</li>
          </ul>
          <p className="text-gray-700">
            Content that violates these guidelines may be removed. Severe or
            repeated violations may result in permanent account suspension.
            Anonymous content that violates these Terms may be traced back to the
            author for enforcement purposes.
          </p>
        </section>

        <section className="mt-6 space-y-4">
          <h2 className="text-lg font-semibold">
            4. Intellectual Property &amp; Content License
          </h2>
          <p className="text-gray-700">
            You retain ownership of the content you post. By posting, you grant
            us a non-exclusive, sublicensable license to use, display, and
            distribute your content for operating and promoting the service. We
            respect intellectual property rights — if you believe content
            infringes your rights, please report it through the in-app reporting
            feature or contact us.
          </p>
        </section>

        <section className="mt-6 space-y-4">
          <h2 className="text-lg font-semibold">
            5. Transactions &amp; Offline Activities Disclaimer
          </h2>
          <p className="text-gray-700">
            ULink provides information matching only. The &ldquo;Errands&rdquo;
            and &ldquo;Secondhand&rdquo; features do{" "}
            <strong>not</strong> process payments. All offline transactions are
            conducted at your own risk. Please take appropriate precautions for
            personal and property safety. The platform bears{" "}
            <strong>no responsibility</strong> for any transactions between
            users.
          </p>
        </section>

        <section className="mt-6 space-y-4">
          <h2 className="text-lg font-semibold">6. Disclaimer of Warranties</h2>
          <p className="text-gray-700">
            User-generated content is the sole responsibility of the user who
            posted it. We do not guarantee the accuracy or legality of user
            content but will act on reports of violations. The service is
            provided &ldquo;as is.&rdquo; To the extent permitted by law, we are
            not liable for service interruptions, data loss, or indirect damages.
          </p>
        </section>

        <section className="mt-6 space-y-4">
          <h2 className="text-lg font-semibold">
            7. Account Deletion
          </h2>
          <p className="text-gray-700">
            You may delete your account at any time through the Settings screen.
            Upon deletion, your personal information will be anonymized and your
            private data (messages, follows, blocks, notifications) will be
            permanently removed. See our{" "}
            <a href="/privacy" className="text-blue-600 underline">
              Privacy Policy
            </a>{" "}
            for details on data retention and deletion.
          </p>
        </section>

        <section className="mt-6 space-y-4">
          <h2 className="text-lg font-semibold">8. Governing Law</h2>
          <p className="text-gray-700">
            These Terms are governed by the laws of the Hong Kong Special
            Administrative Region. Any disputes shall be subject to the
            exclusive jurisdiction of the courts of Hong Kong SAR.
          </p>
        </section>

        <section className="mt-6 space-y-4">
          <h2 className="text-lg font-semibold">9. Contact Us</h2>
          <p className="text-gray-700">
            For questions about these Terms, please contact us at:
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
        <h1 className="text-2xl font-bold">ULink 用户协议（服务条款）</h1>
        <p className="mt-2 text-sm text-gray-500">
          生效日期：2026 年 3 月 5 日 &nbsp;|&nbsp; 最后更新：2026 年 3 月 5 日
        </p>

        <section className="mt-6 space-y-4">
          <h2 className="text-lg font-semibold">一、服务说明</h2>
          <p className="text-gray-700">
            ULink
            是面向大学校园的社区平台。使用本服务即表示您同意本协议。我们保留修改本协议的权利，重大变更将通过应用内通知或邮件告知。
          </p>
        </section>

        <section className="mt-6 space-y-4">
          <h2 className="text-lg font-semibold">二、使用资格</h2>
          <p className="text-gray-700">
            您必须年满 <strong>13 周岁</strong>方可使用
            ULink。本服务面向大学生。创建账号即表示您符合上述条件。
          </p>
        </section>

        <section className="mt-6 space-y-4">
          <h2 className="text-lg font-semibold">
            三、账号与社区规范
          </h2>
          <p className="text-gray-700">
            您需提供真实、准确的注册信息，并妥善保管账号与密码。您须遵守以下规定：
          </p>
          <ul className="list-disc space-y-1 pl-6 text-gray-700">
            <li>遵守社区规范，合理使用匿名功能。</li>
            <li>不得发布违法、侵权、骚扰、侮辱性或虚假内容。</li>
            <li>禁止冒充他人或干扰服务运行。</li>
          </ul>
          <p className="text-gray-700">
            违规内容可能被删除，严重或多次违规者将被永久封禁。匿名发布的违规内容，平台有权追溯至原作者并依规处理。
          </p>
        </section>

        <section className="mt-6 space-y-4">
          <h2 className="text-lg font-semibold">四、知识产权与内容授权</h2>
          <p className="text-gray-700">
            您保留对所发内容的知识产权。您授予我们非独占、可再许可的使用权，以便运营、展示与推广服务。我们尊重他人知识产权，如您认为内容侵权，可通过应用内举报或联系我们处理。
          </p>
        </section>

        <section className="mt-6 space-y-4">
          <h2 className="text-lg font-semibold">五、交易与线下行为免责</h2>
          <p className="text-gray-700">
            本平台仅提供信息撮合服务。「跑腿」及「二手」功能
            <strong>不提供支付环节</strong>
            ，所有线下交易请注意人身及财产安全。平台
            <strong>不承担</strong>任何交易相关责任。
          </p>
        </section>

        <section className="mt-6 space-y-4">
          <h2 className="text-lg font-semibold">六、免责声明</h2>
          <p className="text-gray-700">
            用户发布的内容由用户自行负责。我们不对用户内容的准确性、合法性承担责任，但会依规处理举报与违规内容。服务按「现状」提供，在法律允许范围内，我们不对服务中断、数据丢失等间接损失负责。
          </p>
        </section>

        <section className="mt-6 space-y-4">
          <h2 className="text-lg font-semibold">七、账号注销</h2>
          <p className="text-gray-700">
            您可随时通过设置页面注销账号。注销后，您的个人信息将被匿名化处理，私人数据（私信、关注、屏蔽、通知）将被永久删除。详情请参阅我们的
            <a href="/privacy" className="text-blue-600 underline">
              隐私政策
            </a>
            。
          </p>
        </section>

        <section className="mt-6 space-y-4">
          <h2 className="text-lg font-semibold">八、适用法律</h2>
          <p className="text-gray-700">
            本协议受中国香港特别行政区法律管辖。任何争议应提交香港特别行政区法院专属管辖。
          </p>
        </section>

        <section className="mt-6 space-y-4">
          <h2 className="text-lg font-semibold">九、联系方式</h2>
          <p className="text-gray-700">
            有关本协议的问题，请联系：
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
