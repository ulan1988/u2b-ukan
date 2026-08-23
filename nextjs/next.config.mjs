/** @type {import('next').NextConfig} */
const nextConfig = {
  // Короткий SHA текущего деплоя — показываем в шапке кабинета, чтобы видеть «свежая ли версия».
  env: {
    NEXT_PUBLIC_BUILD_SHA: (process.env.VERCEL_GIT_COMMIT_SHA || 'dev').slice(0, 7),
  },
};

export default nextConfig;
