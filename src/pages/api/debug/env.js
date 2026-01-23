// Simple endpoint to check environment configuration
export default function handler(req, res) {
  console.log("\n\n========== ENV DEBUG ==========");
  
  const envInfo = {
    NODE_ENV: process.env.NODE_ENV,
    MONGODB_URI_SET: !!process.env.MONGODB_URI,
    MONGODB_URI_FIRST_50: process.env.MONGODB_URI?.substring(0, 50) || "NOT SET",
    NEXTAUTH_URL: process.env.NEXTAUTH_URL,
  };
  
  console.log("Environment:", envInfo);
  
  return res.status(200).json(envInfo);
}
