import { Router } from "express";

import { authenticate } from "../middlewares/auth.middleware.js";
import { validate } from "../middlewares/validate.middleware.js";
import {
  createAddressSchema,
  updateAddressSchema,
  addressQuerySchema,
  addressParamSchema,
} from "../validation/address.schema.js";
import {
  getAddresses,
  getDefaultAddress,
  getAddressById,
  createAddress,
  updateAddress,
  setDefaultAddress,
  deleteAddress,
} from "../controllers/address.controller.js";

const router = Router();

router.use(authenticate);

router.get("/", validate(addressQuerySchema, "query"), getAddresses);
router.get("/default", validate(addressQuerySchema, "query"), getDefaultAddress);
router.get("/:id", validate(addressParamSchema, "params"), getAddressById);
router.post("/", validate(createAddressSchema, "body"), createAddress);
router.patch(
  "/:id",
  validate(addressParamSchema, "params"),
  validate(updateAddressSchema, "body"),
  updateAddress,
);
router.patch(
  "/:id/set-default",
  validate(addressParamSchema, "params"),
  setDefaultAddress,
);
router.delete("/:id", validate(addressParamSchema, "params"), deleteAddress);

export default router;
