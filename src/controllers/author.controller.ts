import { asyncHandler } from "../utils/async-handler.js";
import { apiResponse } from "../utils/api-response.js";
import { HTTP_STATUS } from "../constants/http-status.js";
import {
  getAuthorsService,
  getAuthorByIdOrSlugService,
  createAuthorService,
  updateAuthorService,
  deleteAuthorService,
} from "../services/author.service.js";
import type {
  AuthorQueryInput,
  CreateAuthorInput,
  UpdateAuthorInput,
} from "../validation/author.schema.js";

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

export const getAuthorByIdOrSlug = asyncHandler(async (req, res) => {
  const idOrSlug = (req.params.idOrSlug ?? req.params.slug) as string;
  const author = await getAuthorByIdOrSlugService(idOrSlug);

  apiResponse(
    res,
    HTTP_STATUS.OK,
    "Author retrieved successfully",
    author,
  );
});

export const getAuthorBySlug = getAuthorByIdOrSlug;

export const createAuthor = asyncHandler(async (req, res) => {
  const author = await createAuthorService(
    req.body as CreateAuthorInput,
  );

  apiResponse(
    res,
    HTTP_STATUS.CREATED,
    "Author created successfully",
    author,
  );
});

export const updateAuthor = asyncHandler(async (req, res) => {
  const authorId = req.params.id as string;
  const input = req.body as UpdateAuthorInput;

  const author = await updateAuthorService(authorId, input);

  apiResponse(
    res,
    HTTP_STATUS.OK,
    "Author updated successfully",
    author,
  );
});

export const deleteAuthor = asyncHandler(async (req, res) => {
  const authorId = req.params.id as string;

  const author = await deleteAuthorService(authorId);

  apiResponse(
    res,
    HTTP_STATUS.OK,
    "Author deleted successfully",
    author,
  );
});



