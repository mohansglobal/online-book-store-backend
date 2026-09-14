import { connectDB } from "../config/db.js";
import mongoose from "mongoose";
import { Writable } from "stream";
import { UserModel } from "../models/user.model.js";
import {
  updateUserProfileImageService,
  removeUserProfileImageService,
} from "../services/auth.service.js";
import { isCloudinaryConfigured, cloudinary } from "../config/cloudinary.js";

// Minimal valid 1x1 transparent PNG buffer
const SAMPLE_PNG_BUFFER = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
  "base64",
);

async function runProfileImageUploadTest() {
  console.log("=== Profile Image Upload Verification ===");
  await connectDB();

  console.log("Cloudinary configured:", isCloudinaryConfigured);

  // Stub Cloudinary uploader to ensure reliable testing regardless of external network / API key validity
  let uploadCounter = 0;
  cloudinary.uploader.upload_stream = ((
    options: any,
    callback?: (error: any, result?: any) => void,
  ) => {
    uploadCounter++;
    const publicId = `online-book-store/users/test_user_${Date.now()}_${uploadCounter}`;
    const secureUrl = `https://res.cloudinary.com/demo/image/upload/v1612345678/${publicId}.png`;

    const writable = new Writable({
      write(_chunk, _encoding, next) {
        next();
      },
      final(next) {
        if (callback) {
          callback(null, {
            public_id: publicId,
            secure_url: secureUrl,
            url: secureUrl.replace("https", "http"),
            format: "png",
            width: 500,
            height: 500,
            bytes: SAMPLE_PNG_BUFFER.length,
            resource_type: "image",
          });
        }
        next();
      },
    });

    return writable;
  }) as any;

  cloudinary.uploader.destroy = (async (publicId: string) => {
    console.log(`[Cloudinary Mock] Destroy called for publicId: ${publicId}`);
    return { result: "ok" };
  }) as any;

  // Find a test user or create one
  let testUser = await UserModel.findOne({ email: "test.profile.upload@example.com" });
  if (testUser) {
    await UserModel.findByIdAndDelete(testUser._id);
  }

  testUser = await UserModel.create({
    name: "Profile Upload Test User",
    email: "test.profile.upload@example.com",
    password: "$2a$12$e8w.x.fakehashedpasswordforunittests000000000000000000",
    mobileNumber: "9988776655",
    role: "BUYER",
    isActive: true,
  });
  console.log("Created test user:", testUser._id);

  const userId = testUser._id.toString();

  // Test 1: Upload Profile Image
  console.log("\n1. Testing profile image upload service...");
  const uploadResult = await updateUserProfileImageService(userId, SAMPLE_PNG_BUFFER);
  console.log("✅ Upload response received:", {
    imageUrl: uploadResult.imageUrl,
    publicId: uploadResult.publicId,
    userProfilePic: uploadResult.user.profilePicture,
  });

  if (!uploadResult.imageUrl || !uploadResult.user.profilePicture) {
    throw new Error("Profile picture was not set on the user object");
  }

  // Verify in database
  const userInDb = await UserModel.findById(userId);
  if (!userInDb?.profilePicture || userInDb.profilePicture !== uploadResult.imageUrl) {
    throw new Error("Database profilePicture does not match upload URL");
  }
  console.log("✅ Database verified: user.profilePicture =", userInDb.profilePicture);

  // Test 2: Overwrite with new image (should trigger deletion of old image & store new)
  console.log("\n2. Testing profile image overwrite (should delete previous public_id)...");
  const overwriteResult = await updateUserProfileImageService(userId, SAMPLE_PNG_BUFFER);
  console.log("✅ Overwrite response received:", {
    imageUrl: overwriteResult.imageUrl,
    publicId: overwriteResult.publicId,
  });

  const updatedUserInDb = await UserModel.findById(userId);
  if (updatedUserInDb?.profilePicture !== overwriteResult.imageUrl) {
    throw new Error("Database did not update to new profilePicture URL on overwrite");
  }
  console.log("✅ Database verified: updated user.profilePicture =", updatedUserInDb.profilePicture);

  // Test 3: Remove Profile Image
  console.log("\n3. Testing profile image removal...");
  const removeResult = await removeUserProfileImageService(userId);
  console.log("✅ Remove response received, profilePicture =", removeResult.profilePicture);

  const finalUserInDb = await UserModel.findById(userId);
  if (finalUserInDb?.profilePicture) {
    throw new Error("Expected user profilePicture in DB to be empty after removal");
  }
  console.log("✅ Database verified: user.profilePicture is undefined/removed");

  // Cleanup test user
  await UserModel.findByIdAndDelete(userId);
  console.log("\nCleaned up test user.");

  console.log("=== All Profile Image Upload tests passed successfully ===");
  await mongoose.disconnect();
}

runProfileImageUploadTest().catch(async (err) => {
  console.error("Test failed:", err);
  await mongoose.disconnect();
  process.exit(1);
});
