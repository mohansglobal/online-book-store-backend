import express from "express";
import cors from "cors";
import helmet from "helmet";
import cookieParser from "cookie-parser";
import morgan from "morgan";
import path from "path";

import { errorHandler } from "./middlewares/error.middleware.js";
import { notFoundHandler } from "./middlewares/not-found.middleware.js";
import { apiResponse } from "./utils/api-response.js";
import { HTTP_STATUS } from "./constants/http-status.js";
import authRouter from "./routes/auth.routes.js";
import categoryRouter from "./routes/category.routes.js";
import authorRouter from "./routes/author.routes.js";
import publisherRouter from "./routes/publisher.routes.js";
import bookRouter from "./routes/book.routes.js";
import bookListingRouter from "./routes/book-listing.routes.js";

const app = express();

app.use(
  helmet({
    crossOriginResourcePolicy: { policy: "cross-origin" },
  }),
);
app.use(
  "/assets",
  express.static(path.join(process.cwd(), "src", "assets")),
);
app.use(
  "/assets/upload/author",
  express.static(
    path.join(process.cwd(), "src", "assets", "upload", "author"),
  ),
);
app.use(
  cors({
    origin: "http://localhost:3000",
    credentials: true,
  }),
);

app.use(morgan("dev"));
app.use(express.json());
app.use(cookieParser());

app.get("/", (_req, res) => {
  apiResponse(res, HTTP_STATUS.OK, "API is healthy");
});

app.use("/api/v1/auth", authRouter);
app.use("/api/v1/categories", categoryRouter);
app.use("/api/v1/authors", authorRouter);
app.use("/api/v1/publishers", publisherRouter);
app.use("/api/v1/books", bookRouter);
app.use("/api/v1/listings", bookListingRouter);

app.use(notFoundHandler);
app.use(errorHandler);

export default app;