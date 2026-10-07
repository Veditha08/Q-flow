require("dotenv").config();
const app = require("./app");

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
    console.log(`[Q-flow] Server is running on http://localhost:${PORT}`);
    console.log(`[Q-flow] Environment: ${process.env.NODE_ENV || "development"}`);
});
