export default {
  async fetch(request, env) {
    if (request.method === "POST") {
      try {
        const payload = await request.json();

        // Убедимся, что это текстовое сообщение
        if (payload.message && payload.message.text) {
          const chatId = payload.message.chat.id.toString();
          const text = payload.message.text.trim();

          // Проверка: отвечаем только вам
          if (chatId !== env.ALLOWED_CHAT_ID) {
            return new Response("OK");
          }

          let inputs = {};
          let replyMessage = "";

          // Проверяем, это команда или токен?
          if (text === "/run" || text === "/check" || text === "/start") {
            // Оставляем inputs пустым - GitHub Action возьмет токен из своих секретов
            replyMessage =
              "⏳ Отправлена команда на ручной запуск проверки (со старым токеном)...";
          } else {
            // Считаем, что это новый токен
            inputs = { newToken: text };
            replyMessage =
              "✅ Получен новый токен! Запускаю GitHub Actions для обновления секрета и кликов...";
          }

          // Делаем POST запрос к GitHub API (workflow_dispatch)
          const githubRepo = env.GITHUB_REPO;
          const githubToken = env.GITHUB_PAT;
          const workflowId = "cron.yml";

          const githubRes = await fetch(
            `https://api.github.com/repos/${githubRepo}/actions/workflows/${workflowId}/dispatches`,
            {
              method: "POST",
              headers: {
                Authorization: `Bearer ${githubToken}`,
                Accept: "application/vnd.github.v3+json",
                "User-Agent": "Cloudflare-Worker",
              },
              body: JSON.stringify({
                ref: "main", // Ваша ветка
                inputs: inputs, // Если пустой, токен не обновится, просто пройдет ран
              }),
            },
          );

          if (!githubRes.ok) {
            const errorText = await githubRes.text();
            replyMessage = `❌ Ошибка вызова GitHub: ${githubRes.status} ${errorText}`;
          }

          // Посылаем ответ в Telegram
          await fetch(
            `https://api.telegram.org/bot${env.TG_BOT_TOKEN}/sendMessage`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                chat_id: chatId,
                text: replyMessage,
              }),
            },
          );
        }
        return new Response("OK");
      } catch (e) {
        return new Response("Error", { status: 500 });
      }
    }
    return new Response("Method not allowed", { status: 405 });
  },
};
