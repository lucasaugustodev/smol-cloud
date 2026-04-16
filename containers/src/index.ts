import express from "express";
import { router } from "./routes.js";

const app = express();
app.use(express.json({ limit: "10mb" }));
app.use(router);

const port = parseInt(process.env.CONTAINERS_PORT || "9090");
app.listen(port, () => {
  console.log(`[AIC Containers] Running on port ${port}`);
});
