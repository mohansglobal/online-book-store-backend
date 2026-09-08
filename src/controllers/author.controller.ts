import { asyncHandler } from "../utils/async-handler.js";
import { apiResponse } from "../utils/api-response.js";
import { HTTP_STATUS } from "../constants/http-status.js";
import {
  getAuthorsService,
  getAuthorBySlugService,
} from "../services/author.service.js";
import type { AuthorQueryInput } from "../validation/author.schema.js";

export const getAuthors = asyncHandler(async (req, res) => {
  const { authors, meta } = await getAuthorsService(
    req.query as unknown as AuthorQueryInput,
  );

  apiResponse(
    res,
    HTTP_STATUS.OK,
    "Authors retrieved successfully",
    authors,
    meta,
  );
});

export const getAuthorBySlug = asyncHandler(async (req, res) => {
  const author = await getAuthorBySlugService(req.params.slug as string);

  apiResponse(
    res,
    HTTP_STATUS.OK,
    "Author retrieved successfully",
    author,
  );
});
