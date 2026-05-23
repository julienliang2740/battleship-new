import { createApp } from "./app.js";
import { PORT } from "./config.js";

const app = createApp();
app.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`Battleship backend listening on http://localhost:${PORT}`);
});
