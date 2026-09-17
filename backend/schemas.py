from pydantic import BaseModel

class Project(BaseModel):
  name:str
  description:str


class UserCreate(BaseModel):
    name: str
    email: str
    password: str


class UserLogin(BaseModel):
    email: str
    password: str

class AddMember(BaseModel):
    email: str
    role: str = "developer"

class UpdateFile(BaseModel):
    content: str


class CreateFile(BaseModel):
    name: str
    path: str
    content: str = ""