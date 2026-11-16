import os
import sys
import uuid
import unittest
from fastapi.testclient import TestClient

# Ensure root directory is on sys.path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from backend.app.main import app, request_history
from backend.app.database import SessionLocal, init_db
from backend.app.models import User, Video, Flashcard
from backend.app.services.auth_service import AuthService

class TestAuthPhase1(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        init_db()
        cls.client = TestClient(app)

    def setUp(self):
        request_history.clear()

    def test_01_health_check(self):
        resp = self.client.get("/api/health")
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.json().get("status"), "healthy")

    def test_02_default_unauthenticated_user_fallback(self):
        # Without Authorization header, /api/auth/me should return Default Workspace user (ID=1)
        resp = self.client.get("/api/auth/me")
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertEqual(data.get("id"), 1)
        self.assertEqual(data.get("email"), "guest@youtuberecall.local")

    def test_03_registration_and_validation(self):
        # Invalid email
        bad_email_resp = self.client.post("/api/auth/register", json={
            "email": "not-an-email",
            "password": "validpassword123",
            "full_name": "Test User"
        })
        self.assertEqual(bad_email_resp.status_code, 400)

        # Password too short
        short_pw_resp = self.client.post("/api/auth/register", json={
            "email": f"testshort_{uuid.uuid4().hex[:6]}@example.com",
            "password": "123",
            "full_name": "Test User"
        })
        self.assertIn(short_pw_resp.status_code, [400, 422])

        # Successful registration
        uid = uuid.uuid4().hex[:8]
        user_email = f"alice_{uid}@example.com"
        reg_resp = self.client.post("/api/auth/register", json={
            "email": user_email,
            "password": "SecurePassword123!",
            "full_name": "Alice Researcher"
        })
        self.assertEqual(reg_resp.status_code, 201)
        reg_data = reg_resp.json()
        self.assertIn("access_token", reg_data)
        self.assertEqual(reg_data["user"]["email"], user_email)
        self.assertEqual(reg_data["user"]["full_name"], "Alice Researcher")

        # Duplicate email should be rejected
        dup_resp = self.client.post("/api/auth/register", json={
            "email": user_email,
            "password": "AnotherPassword456",
            "full_name": "Alice Duplicate"
        })
        self.assertEqual(dup_resp.status_code, 400)

    def test_04_login_and_jwt_profile(self):
        uid = uuid.uuid4().hex[:8]
        user_email = f"bob_{uid}@example.com"
        # Register Bob
        self.client.post("/api/auth/register", json={
            "email": user_email,
            "password": "BobsPassword789!",
            "full_name": "Bob Learner"
        })

        # Bad password login
        bad_login = self.client.post("/api/auth/login", json={
            "email": user_email,
            "password": "WrongPassword!"
        })
        self.assertEqual(bad_login.status_code, 401)

        # Good login
        good_login = self.client.post("/api/auth/login", json={
            "email": user_email,
            "password": "BobsPassword789!"
        })
        self.assertEqual(good_login.status_code, 200)
        token_data = good_login.json()
        token = token_data["access_token"]
        self.assertTrue(bool(token))

        # Check /api/auth/me with Bearer token
        headers = {"Authorization": f"Bearer {token}"}
        me_resp = self.client.get("/api/auth/me", headers=headers)
        self.assertEqual(me_resp.status_code, 200)
        me_data = me_resp.json()
        self.assertEqual(me_data["email"], user_email)
        self.assertEqual(me_data["full_name"], "Bob Learner")

    def test_05_multi_tenancy_data_isolation(self):
        uid1 = uuid.uuid4().hex[:8]
        uid2 = uuid.uuid4().hex[:8]
        email_char = f"charlie_{uid1}@example.com"
        email_diana = f"diana_{uid2}@example.com"

        # 1. Register User Charlie
        char_reg = self.client.post("/api/auth/register", json={
            "email": email_char,
            "password": "CharliesPassword123!",
            "full_name": "Charlie Isolation"
        })
        self.assertEqual(char_reg.status_code, 201)
        char_token = char_reg.json()["access_token"]
        char_headers = {"Authorization": f"Bearer {char_token}"}

        # 2. Register User Diana
        diana_reg = self.client.post("/api/auth/register", json={
            "email": email_diana,
            "password": "DianasPassword123!",
            "full_name": "Diana Isolation"
        })
        self.assertEqual(diana_reg.status_code, 201)
        diana_token = diana_reg.json()["access_token"]
        diana_headers = {"Authorization": f"Bearer {diana_token}"}

        # Query Charlie's library initially - must be empty
        char_library = self.client.get("/api/videos", headers=char_headers).json()
        self.assertEqual(len(char_library), 0)

        # Directly insert a video owned by Charlie
        db = SessionLocal()
        charlie_user = db.query(User).filter(User.email == email_char).first()
        charlie_vid = Video(
            user_id=charlie_user.id,
            video_id=f"VID_{uid1}",
            title="Charlie Private Research",
            channel_title="Private Channel",
            duration_seconds=300,
            status="PROCESSED",
            is_educational=True,
            category="Science & Mathematics"
        )
        db.add(charlie_vid)
        db.commit()
        db.refresh(charlie_vid)
        charlie_vid_id = charlie_vid.id
        db.close()

        # 3. Charlie queries library: sees 1 video
        char_library_after = self.client.get("/api/videos", headers=char_headers).json()
        self.assertEqual(len(char_library_after), 1)
        self.assertEqual(char_library_after[0]["video_id"], f"VID_{uid1}")

        # 4. Diana queries library: sees 0 videos (complete isolation!)
        diana_library = self.client.get("/api/videos", headers=diana_headers).json()
        self.assertEqual(len(diana_library), 0)

        # 5. Diana attempts direct access to Charlie's video: returns 404 (prevent ID probing)
        diana_forbidden_get = self.client.get(f"/api/videos/{charlie_vid_id}", headers=diana_headers)
        self.assertEqual(diana_forbidden_get.status_code, 404)

        # 6. Diana attempts to delete Charlie's video: returns 404
        diana_forbidden_del = self.client.delete(f"/api/videos/{charlie_vid_id}", headers=diana_headers)
        self.assertEqual(diana_forbidden_del.status_code, 404)

        # 7. Charlie can retrieve their own video successfully
        char_own_vid = self.client.get(f"/api/videos/{charlie_vid_id}", headers=char_headers)
        self.assertEqual(char_own_vid.status_code, 200)
        self.assertEqual(char_own_vid.json()["title"], "Charlie Private Research")

        # Clean up created video
        db = SessionLocal()
        vid_to_del = db.query(Video).filter(Video.id == charlie_vid_id).first()
        if vid_to_del:
            db.delete(vid_to_del)
            db.commit()
        db.close()

if __name__ == "__main__":
    unittest.main()