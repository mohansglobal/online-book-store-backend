import { asyncHandler } from "../utils/async-handler.js";
import { apiResponse } from "../utils/api-response.js";
import { HTTP_STATUS } from "../constants/http-status.js";
import {
  getPublishersService,
  getPublisherByIdOrSlugService,
  createPublisherService,
  updatePublisherService,
  getMyPublisherProfileService,
} from "../services/publisher.service.js";
import type {
  PublisherQueryInput,
  CreatePublisherInput,
  UpdatePublisherInput,
} from "../validation/publisher.schema.js";

export const getPublishers = asyncHandler(async (req, res) => {
  const { publishers, meta } = await getPublishersService(
    req.query as unknown as PublisherQueryInput,
  );

  apiResponse(
    res,
    HTTP_STATUS.OK,
    "Publishers retrieved successfully",
    publishers,
    meta,
  );
});

export const getPublisherByIdOrSlug = asyncHandler(async (req, res) => {
  const publisher = await getPublisherByIdOrSlugService(
    req.params.idOrSlug as string,
  );

  apiResponse(
    res,
    HTTP_STATUS.OK,
    "Publisher retrieved successfully",
    publisher,
  );
});

export const getMyPublisherProfile = asyncHandler(async (req, res) => {
  const publisher = await getMyPublisherProfileService(req.user!.id);

  apiResponse(
    res,
    HTTP_STATUS.OK,
    "Publisher profile retrieved successfully",
    publisher,
  );
});

export const createPublisher = asyncHandler(async (req, res) => {
  const publisher = await createPublisherService(
    req.body as CreatePublisherInput,
  );

  apiResponse(
    res,
    HTTP_STATUS.CREATED,
    "Publisher created successfully",
    publisher,
  );
});

export const updatePublisher = asyncHandler(async (req, res) => {
  const publisher = await updatePublisherService(
    req.params.id as string,
    req.user!,
    req.body as UpdatePublisherInput,
  );

  apiResponse(
    res,
    HTTP_STATUS.OK,
    "Publisher updated successfully",
    publisher,
  );
});
