import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "用户协议（服务条款） - UHUB",
  description: "UHUB 用户协议、服务条款与免责声明",
};

export default function TermsPage() {
  return (
    <main className="min-h-screen bg-white px-4 py-8 text-gray-800 sm:px-6 lg:mx-auto lg:max-w-3xl lg:px-8">
      <h1 className="text-2xl font-bold">UHUB 用户协议（服务条款）</h1>
      <p className="mt-2 text-sm text-gray-500">最后更新：2025 年</p>

      <section className="mt-6 space-y-4">
        <h2 className="text-lg font-semibold">一、服务说明</h2>
        <p className="text-gray-700">
          UHUB 是面向大学校园的社区平台。使用本服务即表示您同意本协议。我们保留修改本协议的权利，重大变更将通过应用内通知或邮件告知。
        </p>
      </section>

      <section className="mt-6 space-y-4">
        <h2 className="text-lg font-semibold">二、账号与使用规范（用户须知）</h2>
        <p className="text-gray-700">
          您需提供真实、准确的注册信息；应妥善保管账号与密码，对账号下的行为负责。您须遵守社区规范，合理使用匿名功能，不得发布违法、侵权、骚扰、侮辱性或虚假内容，禁止冒充他人或干扰服务运行。违规内容可能被删除，严重违规者将被永久封禁。
        </p>
      </section>

      <section className="mt-6 space-y-4">
        <h2 className="text-lg font-semibold">三、知识产权与内容授权</h2>
        <p className="text-gray-700">
          您保留对所发内容的知识产权。您授予我们非独占、可再许可的使用权，以便运营、展示与推广服务。我们尊重他人知识产权，如您认为内容侵权，可通过应用内举报或联系我们处理。
        </p>
      </section>

      <section className="mt-6 space-y-4">
        <h2 className="text-lg font-semibold">四、免责声明</h2>
        <p className="text-gray-700">
          用户发布的内容由用户自行负责。我们不对用户内容的准确性、合法性承担责任，但会依规处理举报与违规内容。服务按「现状」提供，在法律允许范围内，我们不对服务中断、数据丢失等间接损失负责。
        </p>
      </section>

      <section className="mt-6 space-y-4">
        <h2 className="text-lg font-semibold">五、交易与线下行为免责</h2>
        <p className="text-gray-700">
          本平台仅提供信息撮合服务。「跑腿」及「二手」功能不提供支付环节，所有线下交易请注意人身及财产安全，平台不承担任何交易相关责任。
        </p>
      </section>

      <section className="mt-6 space-y-4">
        <h2 className="text-lg font-semibold">六、联系方式</h2>
        <p className="text-gray-700">
          有关本协议或服务的问题，请通过应用内设置或官方渠道联系我们。
        </p>
      </section>
    </main>
  );
}
