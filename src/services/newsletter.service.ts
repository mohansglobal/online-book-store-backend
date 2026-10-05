import { NewsletterSubscriberModel } from "../models/newsletter.model.js";
import { AppError } from "../utils/app-error.js";
import { HTTP_STATUS } from "../constants/http-status.js";
import type {
  SubscribeNewsletterInput,
  UnsubscribeNewsletterInput,
  NewsletterQueryInput,
} from "../validation/newsletter.schema.js";

export const subscribeNewsletterService = async (
  input: SubscribeNewsletterInput,
) => {
  const email = input.email;
  const source = input.source ?? "footer";
  const inputPreferences = input.preferences;

  const existingSubscriber = await NewsletterSubscriberModel.findOne({
    email,
  });

  if (existingSubscriber) {
    const isAlreadyActive = existingSubscriber.isSubscribed;

    const existingNewReleases =
      existingSubscriber.preferences?.newReleases ?? true;
    const existingPriceDrops =
      existingSubscriber.preferences?.priceDrops ?? true;
    const existingOffers = existingSubscriber.preferences?.offers ?? true;

    const updatedPreferences = {
      newReleases: inputPreferences?.newReleases ?? existingNewReleases,
      priceDrops: inputPreferences?.priceDrops ?? existingPriceDrops,
      offers: inputPreferences?.offers ?? existingOffers,
    };

    existingSubscriber.isSubscribed = true;
    existingSubscriber.unsubscribedAt = null as unknown as undefined;
    existingSubscriber.source = source;
    existingSubscriber.preferences = updatedPreferences;

    await existingSubscriber.save();

    return {
      subscriber: existingSubscriber,
      isNewSubscription: false,
      wasReactivated: !isAlreadyActive,
    };
  }

  const newReleasesPreference = inputPreferences?.newReleases ?? true;
  const priceDropsPreference = inputPreferences?.priceDrops ?? true;
  const offersPreference = inputPreferences?.offers ?? true;

  const newSubscriber = await NewsletterSubscriberModel.create({
    email,
    source,
    isSubscribed: true,
    preferences: {
      newReleases: newReleasesPreference,
      priceDrops: priceDropsPreference,
      offers: offersPreference,
    },
  });

  return {
    subscriber: newSubscriber,
    isNewSubscription: true,
    wasReactivated: false,
  };
};

export const unsubscribeNewsletterService = async (
  input: UnsubscribeNewsletterInput,
) => {
  const email = input.email;

  const subscriber = await NewsletterSubscriberModel.findOne({ email });

  if (!subscriber) {
    throw new AppError("Subscriber email not found", HTTP_STATUS.NOT_FOUND);
  }

  if (!subscriber.isSubscribed) {
    return subscriber;
  }

  subscriber.isSubscribed = false;
  subscriber.unsubscribedAt = new Date();

  await subscriber.save();

  return subscriber;
};

export const getSubscribersService = async (query: NewsletterQueryInput) => {
  const page = query.page;
  const limit = query.limit;
  const search = query.search;
  const isSubscribed = query.isSubscribed;
  const sortBy = query.sortBy;
  const sortOrder = query.sortOrder;

  const filter: Record<string, unknown> = {};

  if (search) {
    const escapedSearch = search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    filter.email = { $regex: escapedSearch, $options: "i" };
  }

  if (isSubscribed !== undefined) {
    filter.isSubscribed = isSubscribed;
  }

  const skip = (page - 1) * limit;
  const sortDirection = sortOrder === "asc" ? 1 : -1;

  const total = await NewsletterSubscriberModel.countDocuments(filter);
  const totalPages = Math.ceil(total / limit) || 1;

  const subscribers = await NewsletterSubscriberModel.find(filter)
    .sort({ [sortBy]: sortDirection })
    .skip(skip)
    .limit(limit)
    .lean();

  const meta = {
    page,
    limit,
    total,
    totalPages,
    hasNextPage: page < totalPages,
    hasPrevPage: page > 1,
  };

  return {
    subscribers,
    meta,
  };
};
