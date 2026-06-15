/** @type {import('next').NextConfig} */
const nextConfig = {
  env: {
    ZAPIER_EMAIL_WEBHOOK_URL: process.env.ZAPIER_EMAIL_WEBHOOK_URL,
    JOTFORM_URL_ALTONA_NORTH: process.env.JOTFORM_URL_ALTONA_NORTH,
    JOTFORM_URL_COOLAROO: process.env.JOTFORM_URL_COOLAROO,
  },
}

export default nextConfig
