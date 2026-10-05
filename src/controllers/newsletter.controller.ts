import { asyncHandler } from "../utils/async-handler.js";
import { apiResponse } from "../utils/api-response.js";
import { HTTP_STATUS } from "../constants/http-status.js";
import {
  subscribeNewsletterService,
  unsubscribeNewsletterService,
  getSubscribersService,
} from "../services/newsletter.service.js";
import type {
  SubscribeNewsletterInput,
  UnsubscribeNewsletterInput,
  NewsletterQueryInput,
} from "../validation/newsletter.schema.js";

export const subscribeNewsletter = asyncHandler(async (req, res) => {
  const input = req.body as SubscribeNewsletterInput;

  const result = await subscribeNewsletterService(input);

  let responseMessage = "Successfully subscribed to newsletter updates";

  if (!result.isNewSubscription) {
    if (result.wasReactivated) {
      responseMessage = "Welcome back! Your subscription has been reactivated";
    } else {
      responseMessage =
        "You are already subscribed. Subscription preferences updated";
    }
  }

  const statusCode = result.isNewSubscription
    ? HTTP_STATUS.CREATED
    : HTTP_STATUS.OK;

  apiResponse(res, statusCode, responseMessage, result.subscriber);
});

export const unsubscribeNewsletter = asyncHandler(async (req, res) => {
  const input = req.body as UnsubscribeNewsletterInput;

  const subscriber = await unsubscribeNewsletterService(input);

  apiResponse(
    res,
    HTTP_STATUS.OK,
    "Successfully unsubscribed from newsletter updates",
    subscriber,
  );
});

export const getSubscribers = asyncHandler(async (req, res) => {
  const query = req.query as unknown as NewsletterQueryInput;

  const { subscribers, meta } = await getSubscribersService(query);

  apiResponse(
    res,
    HTTP_STATUS.OK,
    "Newsletter subscribers retrieved successfully",
    subscribers,
    meta,
  );
});
