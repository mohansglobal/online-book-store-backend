import { asyncHandler } from "../utils/async-handler.js";
import { apiResponse } from "../utils/api-response.js";
import { HTTP_STATUS } from "../constants/http-status.js";
import {
  getSiteContentService,
  updateSiteContentService,
  updateSectionContentService,
  resetSiteContentService,
} from "../services/content.service.js";
import type {
  UpdateSiteContentInput,
  HeroContentInput,
  EbooksContentInput,
  PoetryContentInput,
  AnnouncementContentInput,
  NewsletterContentInput,
  ResetSectionInput,
} from "../validation/content.schema.js";

export const getSiteContent = asyncHandler(async (_req, res) => {
  const content = await getSiteContentService();

  apiResponse(
    res,
    HTTP_STATUS.OK,
    "Site content retrieved successfully",
    content,
  );
});

export const updateSiteContent = asyncHandler(async (req, res) => {
  const adminUserId = req.user?.id;
  const input = req.body as UpdateSiteContentInput;

  const content = await updateSiteContentService(input, adminUserId);

  apiResponse(
    res,
    HTTP_STATUS.OK,
    "Site content updated successfully",
    content,
  );
});

export const updateSectionContent = asyncHandler(async (req, res) => {
  const adminUserId = req.user?.id;
  const section = req.params.section as "hero" | "ebooks" | "poetry" | "announcement" | "newsletter";
  const sectionData = req.body as
    | HeroContentInput
    | EbooksContentInput
    | PoetryContentInput
    | AnnouncementContentInput
    | NewsletterContentInput;

  const content = await updateSectionContentService(
    section,
    sectionData,
    adminUserId,
  );

  apiResponse(
    res,
    HTTP_STATUS.OK,
    `Section "${section}" updated successfully`,
    content,
  );
});

export const resetSiteContent = asyncHandler(async (req, res) => {
  const adminUserId = req.user?.id;
  const { section } = (req.body || {}) as ResetSectionInput;

  const content = await resetSiteContentService(section, adminUserId);

  apiResponse(
    res,
    HTTP_STATUS.OK,
    section
      ? `Section "${section}" reset to default successfully`
      : "All site content reset to default successfully",
    content,
  );
});
