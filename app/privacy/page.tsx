import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "隐私政策 - UHUB",
  description: "UHUB 隐私政策与数据使用说明",
};

export default function PrivacyPage() {
  return (
    <main className="min-h-screen bg-white px-4 py-8 text-gray-800 sm:px-6 lg:mx-auto lg:max-w-3xl lg:px-8">
      <h1 className="text-2xl font-bold">UHUB 隐私政策</h1>
      <p className="mt-2 text-sm text-gray-500">最后更新：2025 年</p>

      <section className="mt-6 space-y-4">
        <h2 className="text-lg font-semibold">一、数据收集说明 / 我们收集的信息</h2>
        <p className="text-gray-700">
          为提供与改进服务，我们可能收集：账号信息（邮箱、昵称、头像、年级、专业等）、您发布的帖子与评论、私信内容、上传的图片与语音、设备与日志信息（如 IP、设备型号）。注册验证我们使用
          hCaptcha 防机器人，其数据处理受其隐私政策约束：
          <a
            href="https://www.hcaptcha.com/privacy"
            target="_blank"
            rel="noopener noreferrer"
            className="ml-1 text-blue-600 underline"
          >
            hCaptcha 隐私政策
          </a>
          。
        </p>
      </section>

      <section className="mt-6 space-y-4">
        <h2 className="text-lg font-semibold">二、数据使用与目的</h2>
        <p className="text-gray-700">
          我们使用上述信息以：提供、维护与改进服务；进行身份验证与安全防护；处理举报与违规；发送服务相关通知（如验证码、密码重置）；以及在法律要求或经您同意时进行其他用途。我们不会将您的个人数据出售给第三方。
        </p>
      </section>

      <section className="mt-6 space-y-4">
        <h2 className="text-lg font-semibold">三、数据保留与删除</h2>
        <p className="text-gray-700">
          在您使用账号期间，我们会保留提供服务所需的数据。您可在设置中申请「导出我的数据」以获取您的数据副本。若您注销账号，我们将在合理期限内（如 30
          天内）删除或匿名化您的个人数据；法律法规要求保留的除外。导出方式与时限详见应用内说明。
        </p>
      </section>

      <section className="mt-6 space-y-4">
        <h2 className="text-lg font-semibold">四、数据共享与披露</h2>
        <p className="text-gray-700">
          我们可能与服务提供商（如云存储、邮件、验证码与反垃圾服务）共享必要数据，他们仅能按我们要求处理数据。我们可能在法律要求、保护权利与安全或经您同意时披露数据。
        </p>
      </section>

      <section className="mt-6 space-y-4">
        <h2 className="text-lg font-semibold">五、安全与您的权利</h2>
        <p className="text-gray-700">
          我们采取合理技术与管理措施保护数据安全。您有权访问、更正、删除您的个人数据，以及撤回同意或投诉；部分操作可通过应用内设置或「导出我的数据」完成，其余可通过联系我们处理。
        </p>
      </section>

      <section className="mt-6 space-y-4">
        <h2 className="text-lg font-semibold">六、联系我们</h2>
        <p className="text-gray-700">
          有关隐私或本政策的疑问，请通过应用内设置或官方渠道与我们联系。
        </p>
      </section>
    </main>
  );
}
