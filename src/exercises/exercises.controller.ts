import {
  BadRequestException,
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  ParseUUIDPipe,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { ExercisesService } from './exercises.service';
import { CreateExerciseDto } from './dto/create-exercise.dto';
import { UpdateExerciseDto } from './dto/update-exercise.dto';
import { FileInterceptor } from '@nestjs/platform-express';
import { randomUUID } from 'crypto';
import { existsSync, mkdirSync } from 'fs';
import { diskStorage } from 'multer';
import { extname, join } from 'path';
import { Auth } from 'src/auth/decorators/auth.decorator';
import { GetUser } from 'src/auth/decorators/get-user.decorator';
import { User } from 'src/auth/entities/user.entity';

const exerciseImageStorage = diskStorage({
  destination: (_req, _file, cb) => {
    const destinationPath = join(process.cwd(), 'static', 'uploads', 'exercises');

    if (!existsSync(destinationPath)) {
      mkdirSync(destinationPath, { recursive: true });
    }

    cb(null, destinationPath);
  },
  filename: (_req, file, cb) => {
    cb(null, `${randomUUID()}${extname(file.originalname)}`);
  },
});

const exerciseImageFileFilter = (_req, file, cb) => {
  if (file.mimetype.match(/^image\/(jpeg|png|webp)$/)) {
    return cb(null, true);
  }

  cb(
    new BadRequestException('Only jpeg, png, and webp images are allowed'),
    false,
  );
};

@Controller('exercises')
export class ExercisesController {
  constructor(private readonly exercisesService: ExercisesService) {}

  @Post()
  @Auth()
  @UseInterceptors(
    FileInterceptor('image', {
      storage: exerciseImageStorage,
      fileFilter: exerciseImageFileFilter,
      limits: {
        fileSize: 5 * 1024 * 1024,
      },
    }),
  )
  create(
    @Body() createExerciseDto: CreateExerciseDto,
    @GetUser() user: User,
    @UploadedFile() image?: { filename: string },
  ) {
    return this.exercisesService.create(createExerciseDto, user, image);
  }

  @Get()
  findAll() {
    return this.exercisesService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.exercisesService.findOne(id);
  }

  @Patch(':id')
  @Auth()
  @UseInterceptors(
    FileInterceptor('image', {
      storage: exerciseImageStorage,
      fileFilter: exerciseImageFileFilter,
      limits: {
        fileSize: 5 * 1024 * 1024,
      },
    }),
  )
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() updateExerciseDto: UpdateExerciseDto,
    @GetUser() user: User,
    @UploadedFile() image?: { filename: string },
  ) {
    return this.exercisesService.update(id, updateExerciseDto, user, image);
  }

  @Delete(':id')
  @Auth()
  remove(@Param('id', ParseUUIDPipe) id: string, @GetUser() user: User) {
    return this.exercisesService.remove(id, user);
  }
}
