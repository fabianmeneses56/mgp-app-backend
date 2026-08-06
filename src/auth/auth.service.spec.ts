import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { JwtService } from '@nestjs/jwt';
import {
  BadRequestException,
  InternalServerErrorException,
  UnauthorizedException,
} from '@nestjs/common';
import { AuthService } from './auth.service';
import { User } from './entities/user.entity';
import { PasswordHasher } from './password-hasher/password-hasher';

describe('AuthService', () => {
  let service: AuthService;

  const userRepository = {
    create: jest.fn(),
    save: jest.fn(),
    findOne: jest.fn(),
  };

  const jwtService = {
    sign: jest.fn(),
  };

  const passwordHasher = {
    hash: jest.fn(),
    compare: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: getRepositoryToken(User), useValue: userRepository },
        { provide: JwtService, useValue: jwtService },
        { provide: PasswordHasher, useValue: passwordHasher },
      ],
    }).compile();

    service = module.get(AuthService);
  });

  describe('create', () => {
    it('hashes the password, saves the user and returns it without password but with a token', async () => {
      const dto = {
        email: 'test@test.com',
        password: 'Password1',
        fullName: 'Test User',
      };
      passwordHasher.hash.mockResolvedValue('hashed-password');
      userRepository.create.mockImplementation((data: Partial<User>) => ({
        ...data,
      }));
      userRepository.save.mockImplementation((savedUser: Partial<User>) =>
        Promise.resolve(savedUser),
      );
      jwtService.sign.mockReturnValue('signed-token');

      const result = await service.create(dto);

      expect(passwordHasher.hash).toHaveBeenCalledWith(dto.password);
      expect(userRepository.create).toHaveBeenCalledWith({
        email: dto.email,
        fullName: dto.fullName,
        password: 'hashed-password',
      });
      expect(result).not.toHaveProperty('password');
      expect(result).toEqual({
        email: dto.email,
        fullName: dto.fullName,
        token: 'signed-token',
      });
    });

    it('throws BadRequestException("Email is already registered") on a unique-violation error', async () => {
      passwordHasher.hash.mockResolvedValue('hashed-password');
      userRepository.create.mockImplementation((data: Partial<User>) => ({
        ...data,
      }));
      userRepository.save.mockRejectedValue({ code: '23505' });

      await expect(
        service.create({
          email: 'test@test.com',
          password: 'Password1',
          fullName: 'Test User',
        }),
      ).rejects.toThrow(new BadRequestException('Email is already registered'));
    });

    it('throws InternalServerErrorException on a generic error', async () => {
      passwordHasher.hash.mockResolvedValue('hashed-password');
      userRepository.create.mockImplementation((data: Partial<User>) => ({
        ...data,
      }));
      userRepository.save.mockRejectedValue(new Error('boom'));

      await expect(
        service.create({
          email: 'test@test.com',
          password: 'Password1',
          fullName: 'Test User',
        }),
      ).rejects.toBeInstanceOf(InternalServerErrorException);
    });
  });

  describe('login', () => {
    const loginDto = { email: 'test@test.com', password: 'Password1' };

    it('calls findOne with select: { email: true, password: true, id: true }', async () => {
      userRepository.findOne.mockResolvedValue({
        id: 'user-id',
        email: loginDto.email,
        password: 'hashed-password',
      });
      passwordHasher.compare.mockResolvedValue(true);
      jwtService.sign.mockReturnValue('signed-token');

      await service.login(loginDto);

      expect(userRepository.findOne).toHaveBeenCalledWith({
        where: { email: loginDto.email },
        select: { email: true, password: true, id: true },
      });
    });

    it('throws UnauthorizedException("Credentials are not valid") when the email does not exist, without calling compare', async () => {
      userRepository.findOne.mockResolvedValue(null);

      await expect(service.login(loginDto)).rejects.toThrow(
        new UnauthorizedException('Credentials are not valid'),
      );
      expect(passwordHasher.compare).not.toHaveBeenCalled();
    });

    it('throws the same exception and message when the password is incorrect', async () => {
      userRepository.findOne.mockResolvedValue({
        id: 'user-id',
        email: loginDto.email,
        password: 'hashed-password',
      });
      passwordHasher.compare.mockResolvedValue(false);

      await expect(service.login(loginDto)).rejects.toThrow(
        new UnauthorizedException('Credentials are not valid'),
      );
    });

    it('returns the user with a token signed with { id: user.id } on valid credentials', async () => {
      const user = {
        id: 'user-id',
        email: loginDto.email,
        password: 'hashed-password',
      };
      userRepository.findOne.mockResolvedValue(user);
      passwordHasher.compare.mockResolvedValue(true);
      jwtService.sign.mockReturnValue('signed-token');

      const result = await service.login(loginDto);

      expect(jwtService.sign).toHaveBeenCalledWith({ id: user.id });
      expect(result).toEqual({ ...user, token: 'signed-token' });
    });
  });

  describe('checkAuthStatus', () => {
    it('returns the received user plus a new token', () => {
      const user = { id: 'user-id', email: 'test@test.com' } as User;
      jwtService.sign.mockReturnValue('new-signed-token');

      const result = service.checkAuthStatus(user);

      expect(jwtService.sign).toHaveBeenCalledWith({ id: user.id });
      expect(result).toEqual({ ...user, token: 'new-signed-token' });
    });
  });
});
