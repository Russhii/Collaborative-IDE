from pwdlib import PasswordHash

from jose import jwt, JWTError

from datetime import datetime, timedelta, timezone

from fastapi import HTTPException, Depends
from fastapi.security import OAuth2PasswordBearer

from dotenv import load_dotenv

import os


load_dotenv()


SECRET_KEY = os.getenv("SECRET_KEY")
ALGORITHM = os.getenv("ALGORITHM")

ACCESS_TOKEN_EXPIRE_MINUTES = int(
    os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES")
)


oauth2_scheme = OAuth2PasswordBearer(
    tokenUrl="login"
)


# ---------------------------------------------------------
# DECODE JWT TOKEN
# ---------------------------------------------------------

def decode_token(token: str):
    try:
        payload = jwt.decode(
            token,
            SECRET_KEY,
            algorithms=[ALGORITHM]
        )

        return payload

    except JWTError:
        raise HTTPException(
            status_code=401,
            detail="Invalid token"
        )


# ---------------------------------------------------------
# VERIFY TOKEN - USED BY REST APIs
# ---------------------------------------------------------

def verify_token(
    token: str = Depends(oauth2_scheme)
):
    return decode_token(token)


# ---------------------------------------------------------
# CREATE JWT TOKEN
# ---------------------------------------------------------

def create_token(data: dict):
    to_encode = data.copy()

    expire = datetime.now(timezone.utc) + timedelta(
        minutes=ACCESS_TOKEN_EXPIRE_MINUTES
    )

    to_encode.update({
        "exp": expire
    })

    return jwt.encode(
        to_encode,
        SECRET_KEY,
        algorithm=ALGORITHM
    )


# ---------------------------------------------------------
# PASSWORD HASHING
# ---------------------------------------------------------

password_hash = PasswordHash.recommended()


def hash_password(password: str) -> str:
    return password_hash.hash(password)


def verify_password(
    plain_password: str,
    hashed_password: str
) -> bool:

    return password_hash.verify(
        plain_password,
        hashed_password
    )