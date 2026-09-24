import { Schema, model, type InferSchemaType, type Model } from "mongoose";

const slugify = (text: string): string => {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, "")
    .replace(/[\s_-]+/g, "-")
    .replace(/^-+|-+$/g, "");
};

const authorSchema = new Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    nameBn: {
      type: String,
      trim: true,
    },
    slug: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    bio: {
      type: String,
      trim: true,
    },
    photo: {
      type: String,
      trim: true,
    },
    birthDate: {
      type: Date,
    },
    deathDate: {
      type: Date,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    isDel: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
    versionKey: false,
  },
);

authorSchema.index({ name: "text", nameBn: "text" });

authorSchema.pre("validate", async function () {
  if (this.name && (!this.slug || this.isModified("name"))) {
    let baseSlug = slugify(this.name);
    if (!baseSlug) {
      baseSlug = "author";
    }

    let slug = baseSlug;
    let counter = 1;
    const authorModel = this.constructor as Model<AuthorDocument>;

    while (
      await authorModel.exists({
        slug,
        _id: { $ne: this._id },
      })
    ) {
      slug = `${baseSlug}-${counter}`;
      counter++;
    }

    this.slug = slug;
  }
});

export type AuthorDocument = InferSchemaType<typeof authorSchema>;

export const AuthorModel = model("Author", authorSchema);
